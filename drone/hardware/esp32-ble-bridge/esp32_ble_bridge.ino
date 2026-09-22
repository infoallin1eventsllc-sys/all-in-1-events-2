/*
 * All in 1 Drone Command — ESP32 MAVLink ↔ Bluetooth LE bridge
 *
 * Sits on the flight controller's TELEM port and exposes the serial stream as a
 * Nordic UART Service (NUS) so the dashboard can connect with Web Bluetooth.
 * Bytes are forwarded both ways untouched; MAVLink framing and CRC are handled
 * by the dashboard (src/link/mavlink.ts) and the autopilot.
 *
 * Wiring (ESP32 DevKit → Pixhawk / Cube / Holybro TELEM1 or TELEM2):
 *   ESP32 GPIO16 (RX2)  ←  TELEM TX
 *   ESP32 GPIO17 (TX2)  →  TELEM RX
 *   ESP32 GND           —  TELEM GND
 *   ESP32 5V / VIN      ←  TELEM 5V   (TELEM ports supply 5 V; the DevKit regulates to 3.3 V)
 *   Leave TELEM CTS/RTS unconnected and set SERIALn_FLOW_CTRL (ArduPilot) / MAV_x_FLOW_CTRL (PX4) to off.
 *
 * Autopilot settings (ArduPilot shown; PX4 equivalents in README):
 *   SERIAL1_PROTOCOL = 2 (MAVLink 2), SERIAL1_BAUD = 57 (57600), SR1_* stream rates default.
 *
 * Board: "ESP32 Dev Module" in Arduino IDE 2.x with the espressif/arduino-esp32 core (v2.x or v3.x).
 * Libraries: none beyond the core (uses the bundled BLE stack).
 * Flash: Tools → Board → ESP32 Dev Module, Upload speed 921600, then Upload.
 *
 * Range: ~30 m line of sight with the DevKit's PCB antenna — for pad checks and pairing,
 * not for flight. Use the USB telemetry radio path for flight.
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---- configuration --------------------------------------------------------
static const char*    DEVICE_NAME     = "A1-Drone-Bridge";   // shows in the browser's picker
static const uint32_t TELEM_BAUD      = 57600;               // must match SERIALn_BAUD
static const int      TELEM_RX_PIN    = 16;
static const int      TELEM_TX_PIN    = 17;
static const int      LED_PIN         = 2;                   // onboard LED: solid = linked, blink = advertising
static const size_t   BLE_CHUNK_MAX   = 180;                 // ≤ negotiated MTU − 3; browser asks for 185+

// Nordic UART Service UUIDs — the dashboard filters on these.
#define NUS_SERVICE_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_RX_UUID      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"  // browser writes here → we forward to TELEM
#define NUS_TX_UUID      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  // we notify here ← TELEM bytes

// ---- state ----------------------------------------------------------------
static BLEServer*         server    = nullptr;
static BLECharacteristic* txChar    = nullptr;
static volatile bool      linked    = false;
static size_t             chunkMax  = 20;                    // grows after MTU exchange
static uint8_t            txBuf[256];
static size_t             txLen     = 0;
static uint32_t           lastFlush = 0;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* s) override {
    linked = true;
    // Browsers negotiate MTU right after connecting; assume the larger size once they do.
    chunkMax = 20;
  }
  void onDisconnect(BLEServer* s) override {
    linked = false;
    chunkMax = 20;
    // Resume advertising so the dashboard can reconnect without a power cycle.
    BLEDevice::startAdvertising();
  }
  void onMtuChanged(BLEServer* s, esp_ble_gatts_cb_param_t* param) override {
    uint16_t mtu = param->mtu.mtu;
    chunkMax = (mtu > 23) ? min((size_t)(mtu - 3), BLE_CHUNK_MAX) : 20;
  }
};

class RxCallbacks : public BLECharacteristicCallbacks {
  // Dashboard → autopilot (heartbeats, commands, mission items).
  void onWrite(BLECharacteristic* c) override {
    std::string v = c->getValue();
    if (!v.empty()) Serial2.write((const uint8_t*)v.data(), v.size());
  }
};

static void flushTx() {
  if (txLen == 0 || !linked) { txLen = 0; return; }
  size_t off = 0;
  while (off < txLen) {
    size_t n = min(chunkMax, txLen - off);
    txChar->setValue(txBuf + off, n);
    txChar->notify();
    off += n;
    // A short pause keeps the BLE stack from dropping notifications under load.
    delay(2);
  }
  txLen = 0;
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);                                    // USB debug
  Serial2.begin(TELEM_BAUD, SERIAL_8N1, TELEM_RX_PIN, TELEM_TX_PIN);

  BLEDevice::init(DEVICE_NAME);
  BLEDevice::setMTU(BLE_CHUNK_MAX + 3);
  server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* svc = server->createService(NUS_SERVICE_UUID);
  txChar = svc->createCharacteristic(NUS_TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  BLECharacteristic* rxChar = svc->createCharacteristic(NUS_RX_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rxChar->setCallbacks(new RxCallbacks());
  svc->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE_UUID);                 // the dashboard's picker filters on this
  adv->setScanResponse(true);
  adv->setMinPreferred(0x06);                            // iOS-friendly intervals
  adv->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("A1 bridge advertising as " DEVICE_NAME);
}

void loop() {
  // Autopilot → dashboard. Coalesce bytes for up to 15 ms or 180 bytes, then notify.
  while (Serial2.available() && txLen < sizeof(txBuf)) {
    txBuf[txLen++] = (uint8_t)Serial2.read();
  }
  uint32_t now = millis();
  if (txLen >= chunkMax || (txLen > 0 && now - lastFlush > 15)) {
    flushTx();
    lastFlush = now;
  }

  // Status LED: solid when a browser is connected, 1 Hz blink while advertising.
  digitalWrite(LED_PIN, linked ? HIGH : ((now / 500) % 2));
}
