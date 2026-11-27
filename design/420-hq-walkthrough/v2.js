const LOGO = {"w":192,"h":192,"pal":[[0,0,0],[93,146,114],[52,158,93],[51,93,71],[96,107,103],[58,60,67],[73,77,81],[126,132,127],[144,153,148],[43,47,51],[173,178,179],[28,29,33],[26,44,36],[64,64,69],[30,81,49],[147,206,172],[169,236,202],[171,206,183],[209,223,205],[111,169,138],[181,218,196],[14,42,23],[11,19,16],[187,195,195],[184,189,193],[187,199,187],[216,217,212],[230,230,217],[233,233,229],[205,207,208],[245,241,230],[251,251,249],[197,202,198],[224,222,213],[242,238,226],[193,191,194]],"rle":"/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wDvAAEBAQIBAwEEAwG4AAEBAQMBBQEGAgQBBwEIAgG0AAEHAQEBAwEJAQYBBAMGAQQBCgEBtAACBAELBQYBBAEGAQQBAAEBsgABBAEBAgkEBgEEAQYBBAEGAgABAbAAAQQBAQEEAQwDBgENAQ4BDwEBAQYCBAEAAQSwAAEEAQECCQIGAQkBDAEOARABEQMEAgABAa4AAwQBCwMGAQkBDAEOAQ8BEgQEAQABAa4AAQYBAQEOAQkCBgEJAQwBDgECARMBEgEIAQYCBK8AAQQBAwEBAQsBDQEGAQ0BDAIOAgIBEAEUAwQBBwEAAQGrAAEHAQYBBAEDAQsCBgEJAgwBAwETAQIBEwEQAQEBBgIEAQABAasAAQQBAwEBAQwBCQEGAQUCDAEOAQIDEwEQAQ8CBAEGrAABAQEEAQMBAQEVAQUBBgEJAQwCDgECAhMBAgEPARADBAEHAQABAakAAQQBBgIDAQsBBgENAQkCDAEDAxMBAgETARABEwMEAQABBJkAAQEBBAQDAQQBAQgAAQQBAwEEAQ4BCQEGAQkBCwEMARUBAgMTAQIBEwEQAQ8DBAEAAQENAAQBhwABBAEDAQ4BBQIGAwQBAwEBBQABAQEEAQMBBAEMAQkBBgEJARUBDAEOAQIEEwECAhADBAIAAQEIAAIBAQQBBgIEAQcCAAEBhAACAwEJAQUCBgENAgYBBAIHAgQDAAEEAQYCAwEWAQUBDQEJARUBDAEOAQIEEwECAQ8BEAQEAQABBAYAAQEBBAEDAQYFBAEHAgABAYIAAQQBAwEMAQkCBgENAQUBDQIFAQYBBAIIAgQBAQETAQYCAwEWAQYBBQELAQwCDgECBBMBAgEPARABAQMEAQABBAQAAQECAwEGCQSDAAEBAgMBCwMGAQ0BBgENAQUCBgENAQYBBAIIAQQBAwIBAQ4BCwEGAQkBCwEMAQ4BAwECAxMCAgETARABEwEGAgQBAAEEAgABAQIDAQYMBIIAAQQBAwEMAQsBBgENAgUBDgIBAQMBDQMGAQ0BBAIIAQQBAQEMAQsBDQEJARYBDAEVCAIBEAETAQYBBAEGAQADAQEDAQYIBAEDAQ8BEQMEgQABAQEDAQQBDAEJAQ0BBQIMARUBAgEPARMBAQEGAQUBDQMGAQQBCAEEAQwBCQEFAQkBFgEMARUIAgEPARMCBAEGAgABBgEFAQYGBAIDAQ4BAQEQARMDBAEAAQd/AAEEAQkBBAEMAwkCFgEMAg4BAQETAQ8BEwEDAQ0CBgENAQYBBAEGAQ0BCQEMARYBDAEOCAIBDwETBAQBAAgEAg4CAgEPARMBAQMEAQABAX8AAQYBDAEEAQwBCwEJAQsCFgEMAQ4BFQIOAQICDwEBBgYBDQEJAQwBFgEVAQ4IAgEPARMLBAEDAQ4EAgETAQEEBAEAAQR+AAEEAQYBFQEDAQkBCwEJAQsCFgEVBg4BAQIPAQQBBQMGAQ0BCQELARYBDAEOAQMHAgEPARMBBAEGBQQBBgEEAQMCDgUCARMBAgEDAwQBAAEEfQABBwEEAQYBFQEOAQkBFgEJAQsCFgEVAQwGDgEDAQ8BEAEBAQUCBgEFAQkBCwEWAQwBDgEDBwIBDwETAQQBBgYEAg4DAgITAQIBEwEBAQMBBgUEfQACBAEGARYBDAEDARYBDAELAxYBFQgOAQEBEAETAwUBCQELARYCDgEDBwIBEwEBAgYCBAIGAQMCDgMCAxMBAgETAQIBAwEGBAQBAX0AAgQBBgEMARYBAwILAQwDFgEMCQ4BAgEQARMBBQIJAQsBFgMOBwIBEwECBQYBAwIOAwIDEwECARMBAgIDBAQBBgEBfAABBwIEAQYBCQEWAQMBCQEWAQwBCwIWARUKDgEDARABEwEFAQkBDAEWAw4HAgETAQIDBgENAQMCDgMCAxMCAgEBAwMEBAEOfQABAQIEAQYBDQEWAQ4BAwEWAgsCFgEVCw4BAgEQARMBDAEVARYBDAEDAQ4BAwYCARMBAwIGAQ0BAwIOBAIDEwMCAQMBDgQEAQYBA30AAQEDBAEGAQwBFQEBAQwBFgEMAQsCFgIDCg4BAgEQAQEBFQEWARUBAwEOAQMEAgEDAQIBAQEDAgYCAwEOBgIBEwMCAQ4BAwEFBAQBCQETAQF9AAMEAQYBCQEVAgMBFgEMAQsCFgEOAQIBAwoOAQEBEAEDARYBFQEDAQ4BAwQCAQMCAgEDAQYBDgEEAQ4KAgEOAQMBDgQEAQYBAwETAQF9AAMEAQYBBQEVAQ4BAwEWAQsBDAELAhYBAwECCw4CDwEMARYBAwIOBQMBAQECAQMBCQMDCQIBDgEDAQ4BDQQEAQkBEwIBfQAEBAEGAQkBDgEDAQ4BFgIMAhYBFQIDARUKDgEQAQEBFgEOAQMBDgUDAQEBAwEJAgMBDgkCAw4BDAQEAQYBAwETAQN+AAEHAwQBBgEFAQ4CAwEVAQsBCQELAhYBDAIOARUJDgECARABDgEVAQIBDgUDAQEBDgEMAQMBDgEDCAICDgEDARUBBgQEAQwBEwEDAQR/AAMEAgYBDgMDARYBCwEMAQsCFgIVAQwBFQkOAQ8BEwEVAQMBDgMDAQ4CAgEOAgMBDggCAg4BAwEVAQUEBAEJAQMBEwEMgAABAQMEAQYBCQEDAQIBAQEJARYBDAELBBYBFQEMARUIDgEDARQBAwMOAgMBDgICAQ4BAwEOAQMGAgEDAg4BAwEVAQkEBAEGAQkBEwEOAQSBAAMEAQYBBQEOAQIBAQEEARYBCwEMAQsEFgEVAQwCFQcOAhMDDgIDAQ4BEwECAQMCDgUCAQMCDgIDARYBDAEGAwQBCAEEAQMBDwEBggABAQIEAQYDAwEOAQkBCwIJAQwBCwUWAQwCFQYOAQMBDwEDARUBDgIDAQ4BDwECAg4BAwMCAQMDDgECAQMBFgEMAQYDBAEGAQQBCgEHAgGDAAEEAQYCAwgJAQsGFgUVBA4CAQIOAwMCEwEOBAMDDgEDAQIBDgEWAQwDBgUEAwgCAYAAAQECAwMJAwUFCQEMARUGFgMVBQ4HAwECBAMBDgEVAQ4BAwEOARUBFgEJBwYBBAIGAgQCCgEHAQR9AAEBAgMBDAEJAgUFCQMFBw4EFQcOCQMCFQEDAg4BDAEOAQMCBAEDBQQFBgIEAgABAXwAAgMBCwEJAQUFCQEFBw4DAwICAQEBAgEDBw4HAwECAQEBDgIDAg4CAwQCAQECEwIPAhMBBAIGAgQBBgIAAQR6AAEEAQMBDAELBAkBBQEOAQwBFQUOBBUDDgEDAQICAQECAQ4BFQIOCAMBAgEQAQEIAwYCAQECDwEQAQ8BAQMEAQZ8AAIDAQsECQEMChUEDAUOAQMBAgEDAg4KAwIBAgIEAwcCAgMCAgETAhABDwIEAQYBBwEAAQF4AAEEAgMBFgMJAQwJFQMMDQ4PAwwCAQMCDgEVAQ4BAwQEAQABBHgAAQYCAwEWAwkBFgEDAQIBDgMVAgwEFQIMDA4JAwQOAwMGAgMDAg4DFQEOARUBDQMEAQcBA3cAAQQDAwEWAgkBCwEWAQMDAgEODxUCFgEVCQ4EAwEVDA4EFQMMAhUBBgEEAQYCBAEDdwABBAEOAgIBFgILAxYBFQUCAQ4EFQEOBRUCFgEVAQ4BFQQOAhUBDgIVAg4BAwEPAQMCDgEDAw4GFQEMAg4BDAEVAxYBBQEEAgYBBAEJAQR2AAEBAQQBDgECAQEBDAEWAgsEFgEVAQ4EAgEDAw4FFQEWAQwFDgEDAQ4CFQEDARUBDAMOARMBEAETAQ4BFQEMBw4CDAEVBBYBCwEFAwYBBAENAQkCAXUAAgQBDgECARMBAwEVARYDCwUWARUBDgEDAg4CFQUWAxUEDgEDARUBDAEVAQEBDgEVBA4BAgIPAQMNFgELAQkBBQQGAQkBCwEBAQMBAXUAAgQBDQECARMBAgEDAQwCFgULDBYBDAIVBQ4BFQEMARYBFQEBAQMBFgEVAgwDDgEBARABAQEVCBYBCwEMAQkBBQQGAQkBFgEVAQEBAgEVdgACBAEGAQ4CAgIDAQ4DFgMLAQwDCwcWAQwCFQQOAhUBDgIWARUBAQEDAhYCFQQOAQIBEAETARUECwIMAgkBBQMGAQUBCQIWAQ4BAQECARYBBHYAAwQBDQIDAQ4BFQIOAQkBDAMWAQsFDAQLAgwBFQMOAhUBDAEOAhYCFQEBAQMCFgUVAg4BAQEQAQEBDAMJAgUCBgENAQUBCQELARYBDAEDAgIBDgEWAQx3AAEBAgQBBgENAQ4BFQMWAQwCDgEMARUDFgILBAkBCwEMARUCDAMVAQ4BDAMWAhUBAQEEAxYHFQETARABAwEFBAYBCQELAhYBFQEOAQQCAQECAQ4BFQEMeAABAQMEAgYBCQEVBBYBFQEOAQMBDgEJAQwCFgMJAQwBCwUVAgwBFQIWAQsBFgIVAgEDFgIVAg4EFQEPARMBDQMGAQ0BFQEMAQ4BAwYCAQ4BA3oAAQEDBAIGAQ0BCQEVBRYBFQEMAQ4BAwEWAwkBCwEMBhUCFgELAQwBCwEWARUBFgEBARMBFQMWARUBDgMDAQ4CFQIEAgYDBAEBAQIBAwMOAgIBAwEEfAABAQQEAgYBDQEJAQwFFgEVAQMBCwIJAQsBFgEOAQwCFQQWAQwBCQEMAQsBFgIVAQMBAQEMAhUDFgEMAQMDAgEOAQwDBgEEAQcCAQEWAhUCDgEDAQR/AAEBBQQDBgEJAQwBFQIWAQwBAwELAgkBCwEWAQwFFgELAwkBDAELARYBDAIVAg4CDAEVBBYBDgEDAQIBAwEVAQ0CBgEEAQcBBAEBARYBDAEOAQMCBIIAAgEEBAIGAQMBBQEJAgwBDgEWAQkBDAELBRYBCwUJAQwCFgIOAhUCCQIMAQsBFQQWAhUBDAMGAgQBAwEBAQkBBgIEAQGDAAEBAgQIAwEEAQEBAwEWAQkBDAELAhYCCwcJAQwCFgIVAhYECQIMBAsCDAQGAQQBBgEEAQEBBA0BeAABAQIDAw4CCQQFAwMBDgEWAgkCCwEMCQkBCwUWDAkFBgEEAQUFAQIDAgYEBAQHAwFzAAEEAQ4CDAUJAQUBCQEFAQ0DBgEJAQwOCQULAQkBBQkJAgUFBgEEAQkBAQECAQMBDgENCQYCBAEHAwgCAXAAAQMBCQILHgkCDAYJAgUCCQMFAQ0GBgEIAQUBAwEOAQkPBgEEAQcBCgEIAQQBAW0AAQMBCQEWIwkEDQEFAwkCBQINBwYBCgEHAQkLBgEECAYBBwEKAQgBBGsAAQMBDgEWBwkCDQUGAQ0RCQEFAwYEBAIHAQQBBgEJAQUSBgQEAQEBBwQIAQQEBgEEAgoBBGkAAQMBDgEWAQsGCQENBgYBBAEIAQcNCQIFAQ0IBgIEAggBBwEGAQUBDRQGBAQBCAIKAQgBBAQGAQgBFwEEZwABAQEOAQwBCwUJAQwICQEFAQYBCgEIDQkBBQENAQUCDQgGAQQBCAEKAQcBBQENDAYBDQwGAQQBCAEXAQgEBgEIARcBBGYAAQMBCQEWAwkCDAELCwkBBgEKAQYLCQEFAQ0CBQENCwYBBAEKAQgBDQoGAgUPBgEEARgBCgEEAwYBCAEKAQRkAAEGAQ4BFgELAwkCCwEMCwkBBQEIAQQKCQMFBA0MBgEKAQgCDQYGAQ0BCQEFEQYBBAEKARcBBAMGAQoBBwEBYgABBAEOAQwBFgMJAwsNCQIEBwkCDAUFBg0KBgEKAQcBBQQGAQ0DCRQGAQoBEQMGAQQBCgEEYgABAwEOARYDCQMLDgkBBAEGBgkCDAEJCQUEDQcGAQ0BBAEKAQYBBQMGAwkTBgEEAQYBBAEXAQgDBgIIAQFgAAEEAQ4BFgELAgkDCwEMDgkCBAUJAgsBCQ0FAg0IBgEIAQQBBQIGAwkBDRYGAQcBFwEEAgYBBAEKAQRfAAEEAQ4BDAEWAwkDCw8JAQQBBgQJAQsBFgELAQkHBQENAQUBCQMLAQkBBQENBwYBBwEIAQUBDQEFAQkBDAEJCgYCCQEMAQkKBgEKAQgDBgIIAQFeAAEDAQ4BFgELAgkDCxAJAQQBBgQJARYBFQEMAQkHBQENAQwBFQQWAQwBDQcGAQQBCAEGAQUBCQIMCgYBCQEVAhYBFQELAQUIBgEEARkBBAIGAQQBCgEDXQABBAEOARUBCwIJAwsBDAcJAQsICQEEAQYDCQELARYBFQEMBwUBDQEJAQwGFgEJCAYBBwEGAQkBDAELAQkJBgEJAQwDFgEVAQwBCwkGAQoBCAMGAQgBBFwAAQEBAwEMARYCCQEMAwsHCQELARYICQEEAQYBDAEJAQwBCwEWARUBCwYJAQUBDQEJBxYBCQgGAQQBDQEJAgsBCQkGAQkBFQEWAxUBDgEVAQkIBgEIAQoDBgEHAQQBAVsAAQMBDgEWAQsCCQELARYBCwgJAQwBFggJAQQBBgIMAQsCFgEVAQsGCQEFAQ0BCQcWAQkIBgEEAQUBCwEWAQwBBQkGAQkBDAEFAQ0BBQEMAQ4BFQELCAYBBAEKAQQCBgEEAQgBA1oAAQQBDgEVAQsBCQEMBAsICQEVARYICQEEAQYBCwEMAQsCFgEOARUBCwEJBAUCCQEMARYBCwQWAQsBCQEGAQ0GBgEEAQkCFgEMCgYBDgQGAQkDFQEFBwYBBAEIAQQDBgEIAQNZAAEHAQ4BDAEWAQwBCQEMAwsICQEMAhYICQEEAQYDCwIWAQMBAgEVARYECwIMAQsBDAILAxYBDAEFBA0FBgEJARYBFQEJCQYBAwEGAQQDBgENAQkCFQEJCAYBCAEHAwYBCAEEWQABBgEJARYBCwEJAQwECwgJAQwCFggJAQQBBgMLAhYBDgETAQMEFQEMARUBFgEMAQkBDAELAhYBDAEJAQUEDQUGAQsBFgEVAQkKBgQEAgYBBQEVARYBCQgGAgcDBgEHAQQBAVcAAQQBDgEMARYBCQILARYCCwkJAxYICQEEAQYDCwMWBBUEFgELAwkCCwEMAQkDBQMNAwYBDQEJAhYBFQEJCAYHBAEGAQ0BDAEVAQwIBgEEAQcDBgIEAQFXAAEFAQwBFgELAQkECwkJARUDFggJAQQBBgMLChYBCwMJAgwCCQQFBA0BBgENAQUBDAIWARUBCQgGAQQBAQEHAQEDBAIGAQwBFQEMCAYBBAEHAwYCBAEDVgABBgEOARYBCwEJAgsBFgILCAkBDAQWCAkBBAEDBAsIFgELBwkHBQINAQYCCQEVAhYBFQEJCAYBBAEHAQgBBwEBAgQCBgEJARUBDAENBwYBBAEHAwYCBAEDVQABBAEOAQwBFgEJBQsJCQQWARUICQEEAQMLCwEMCQkHBQENAQkBBQEVAQsCFgEVAQkIBgEEAwgBAQMEAQYBBQIVAQUHBgEEAQcDBgIEAQNVAAEDAQkBFgELAQwECwkJARUEFgELCAkBBAEGAQwBCQEMBwsBDAoJBgUBDQIJAQwCCwIWARUBCQgGAQQBCAEKAggBAQIEAQYBBQEMARUBBQcGAQQBAQMGAgQBA1QAAQQBDgEVARYBCQILARYCCwcJAgwGFggJAQYBDQMLAQwDCwIMAwkBDAcJBAUBCQIFAgkBFQEWAQkBCwIWARUBCQgGAQQBCAEKAggBAQIEAQYBBQEMARUBBQcGAgQDBgIEAQNUAAEGAQ4BFgMLAhYBCwYJAQwBBgEEAQ4DCQIMAQsICQEEAQECBQEMAQsHCQELAQwHCQMFAQkBBQEJAQwBCQEVARYBCQEMAQsCFgEVAQkBBgENBgYBBAEIAQoDCAEBAQQBBgENAgwBBQcGAgQEBgEEAQNTAAEEAQ4BDAEWAwsBFgILBwkBDQEEAQ0DBgINCQkBBgEEAQYBBAEHAQYBCwUJAgwJCQEFAQkBBQEJAQwBCQEVARYCCQEMAQsCFgEVAQkBBgENBgYBBAEIARkBCgIIAQEBBAEGAQ0CDAgGAgQDBgIEAQNTAAEGAQ4BDAEWAgsCFgILHAkBBAEIAQkBCwMJAQsBDAsJAQUBCQEMAQkBFQEWAwkCCwIWARUBCQYNAgYBBAEIARkBCgIIAQECBAENARUBDAgGAgQDBgEEAQYBA1MAAQUBDgEWAwsCFgILHQkBBAEGAQsCCQELAgwLCQMMAhYECQILAhYBFQELAgUEDQEGAQUBBAEIARkBCgIIAQECBAEFAQwBCQkGAQQBDQIGAQQBBgEDUgABBAEJAQ4BFgILAxYCCx0JAQQBAwEMAQkBDAELAQwLCQELAgwCFgUJAgsCFgEVAQsBCQIFBA0BBQEEAQcCCgIIAQEBBAEGAQUBDAEFCgYBBQIGAQQBDQECUgABBAEMAQ4BFgILAhYBFQILHQkBBgEDAQwBCQMLCgkBDAEJAQwCFgYJAQwBCwIWAhUBCQUFAg0BBgEHAQgBGQIIAQEBBAEGAgkJBgEEAQYBBQIGAQQBBQEBUQABAQEGAQwBDgIWAQsCFgIVAQsdCQENAQUECwoJAgwBFQIWAQsECQEMAQsBDAELAhYCFQELBgUBDQEFAQQBCAIKAQgBAQEEAQ0CCQoGAQUBDQMGAQ4BAVEAAQQBBgEMAQMCFgELAhYBFQEMARYBCx4JAwsKCQEEAQYBDgEJAQUBDQYDAQ0BCQELAxYBDAELBgUCDQEGAQgBCgIIAQEBBAEFAQkDBgENBgYBAwEJAwYBDQEDAQFRAAEEAQYBDAEDAQwBFgELAxYBDgEMARYPCwoJAwsBCQEMARYCCwoJAgQKBgEEAQgBDQMWAQ4BFQEJBAUCDQMGAQcBCAEBAQQBBgEFBwYCDQIGAQ0BBQMGAQkBAwEBUQABBAEGAQ4BAwEOARYBCwMWAg4BFQ8WCAkBBgELARYBFQEMBBYYCQEEAQgBDAIWAg4BCwIJAgUCDQMGAQUEBgINBgYBDQEGAQ0BAwEJBAYBDAEBUQABBwEEAQYBDgIDBhYCFQ8WAQwHCQEEAQ0GFgELGAkBBQEIAQYCFgEVAQMBFQEMAwUFDQEGAQ0BBQINAQUBDQIGBQ0DBQEJAQYBBQEGAQkBDgEBUQABBwEEAQYDDgEMFhYBDAcJAQYBBQYWAQsXCQEFAQkBBAEGAxYCAwEVBAUBDQYFAw0BBQcNAQkBBQEMAQUBBgEFAQYBDAEEAQFRAAEHAgQBBQEVAQwBDhYWAQsHCQEGAQ0CFgELAhYBFQELFwkBBQEJAgYDFgEOARMBAwELEAUBDQEFAQ0BBgEJAQUBDAEJAQ0BBQEGAQkBDAIBUgACBAEGAQwBFQIMFRYBCwcJAQYBDQEWAgsCFgEVAQsZCQEGAQkEFgEBAQ8BDgELAQkFBQEJCQUCDQIJAgwDBQEGAQwBAwECUwACBAEGAQkCFgIMFBYBCwkJAwsCFgEVAQsbCQILAhYBFQITAQ4BFgEJAgUCCQoFAQkBDAEJAQwBFgEJAQUBCQENAQkBDgEBAQNTAAEBAgQBBgEMAhYCDAQWCgsEFgEMARYBCwUJAQsCCQMLAhYBFQEWAQsBDBYJAQsCDAILAxYBFQECAQMBFQEWAQsCCQkFAQkDDAEVARYBCQEFAwkBCwEEAQNVAAIEAQYBCQEMARUBDAIOAgwCFgkLBBYBAwEOAhYDCwEWARUBDAMLBBYBFRYWAhUCDAELAQkCCwQWARUBDgEMAhUBCwEMBgkBDAELAwwCFgEJAgUBCQENAQsBDgEEAQFVAAEBAQYBCQYMAgkBDAEWCQsEFgIOAhUEFgEVARYECwQWAhUFFg0VAgwBDgEDAQIBFQEMAQkDCwQWBhUGFgMVAxYCCQIFAQkCBAIGAgQBAwEEUgABBgIMAwsFCQsLBRYCFQYWBQsTFggVAQ4BDAELAwkDCxMWAQsGCQEGBQQBBwEEAQNQAAEGAQkBCwEWFAsLFgYLHBYBCwYJAwsPFgELDQkBBQEGAQgBCgEDTgABBAEOAQwBFgoLAhYGCw0WAgsBFgULGhYBCwMJCgsKFgILBQkBBQMJAQUBDQEFAgkCBQEJAQgBCgEDTQABDgEJARYFCwIJAQUBDQQGAQUDCwEWAQkEBgENAQkBDAMWBAsBBQEGAQkDCwEWAQwBCQMFBA0BDAEWAQsBFgELAQUBCQEWBQsBFgEJAQYBCQELAgkBDAEJBAYBDQEJAQsBFgULARYBCwINAgsECQEGAQQBBgQJAQUBCQEGAgQCCQENAQkBCAIESwABBAEJARUECwEJAQgDGgEbBRwBHQEJAQsBCAEaBhwBGwEKAQQBFgMLAQQBGgEeARwBBAILAQQBHQgcARsBBgEWAQkBCgEcAR8BCgEMAgsBDAELAQQBGgEfARwBBgEMAQkBCAEbAxwCHgEcASABCAEJBAsBCQEKAR4BHwEKBAkBCAEcAR8BHgEEAgkBBQEJAQQBGgIfAQoBBQENAQkBBgEEAQNLAAEFAQkBFgQLAQQBHQQaAR0EGgEfAQQBBQEgBxoBIQEcAR8BCgILAQkBCgEhARoBHwEXARYBBQEXARwIGgEfAQoBFgEEARoCGwEfAQoBCwEJAQsBCQEKARwBGgEfAQoBCwEEARoDHAEbAxwCHwEcAQQBCwEJAQsBBAEbAh4BHwEEAgkBBgEKAhwBHwEcAQYDCQEKAR4BIgIfAQQCCQEGAQQBA0oAAQECCQEWBAsBCAEXARoBHQcaASEBBAEGAQoDGgEhBBoBHQEaAR8BCAEWAQYBCgIaARwBHQEWAQYBCgQaARsBIQMaARsBCgELAQgBHQEhARoBIQEfAQQCCwEFAQoBHAEaAR8BCgEWAQQBHQEcARsBIQQcAhsCHwEEAQsBCQEHARoCHAEfAQcBDAELAQYBCAMcAR8BCAIJAQQBGgIcAR4BGgEEAgkBDQEEAQ5KAAEEAgkBFgILARYBCwEIARkDGgIKBAgBCgEJAQQBFwIaARsBCgIIAQoBHQIaARwBGwEWAQYBCgIaARwBHQEWAQYBCgEhARoBHAEKBQgBCgEEARYBCAEdASECGgIcAQYBFgEGAQoBHAEaAR8BCgEWAQQBHQEcARsBHAMKASACHAEaAR8BGwEJAQsBCAEhAhwBHwEHAQsBFgEGAQgBIAEfARwBHgEcAQ0BCQEKBBwBIAEFAgkCBgEOSgABBgIJARYCCwEWAQsBCAEKARoBHQEcAQoFBAEGARYBBAEZARoBHQEcAQoDBAEIAxoBHwIJAQoBGgEdARwBHQEWAQYBCgIaAR8BCgUGAQQCFgEIAR0BIQEaASEBGgEfARoBFgEGARcBHAEaAR8BCgEWAQQBHQEcASEBHwEKAgQBAQEKARwCGwEfAQQBFgEIARoCHAEfAQcBCwEWAQkCCAEbAhwBHwEIAQQDHAEbARoBBAEMAQUBCQEGAQkBDkkAAQcBBgEMAQkBFgILAhYBBwEKAR0BIAEcAQoBDAEJAgwBCwIWAQQBCgEaAR0BHAEKAQsBDAEGAQgDGgEeAQYBCQEKARoBHQEcAR0BFgEGAQoCGgEfAQoBCwIJAQUBCQIWAQsBCAEdBRoBHwEIAQUBFwEcARoBHgEKARYBBAEdARwBGgEfAQgBCQEGAQQBCAEgARwBGwEfARkBFgEIARoCHAEfAQcDFgEEAQgBCgEcARsBHgEcASADHAEaAQoBDAIJAQUBBgEMAQNJAAEEAQ0BDAEJARYBCwMWAQcBCgEdASABIQEaBAoBAQIWAQQBCgEaAR0BHAEZAQwBCQEBAR0DGgEcAQkBBQEKARoBHQEcAR0BFgEGAQoCGgEbARwCGgEhARwBIAEFAhYBCAEdBRoBGwEeAQgBCgEcARoBHgEKARYBBAEdARwBGgEfAQQCFgEFAQEBCgEcARsBHgEhAQkBAQEaAhwBHwEHARYBCwEWAQsBBAEIAR0CHAEfAR4DHAEdAQYBDAEFAQkBBgEMAQ4BAkkAAQQBBQIMARYBCwMWAQgBCgEdASABHQEhBBwBHwEEARYBBAEKARoBHQEhAR4DHAMaAR0BIAELAQ0BCgEaAR0BHAEgARYBBgEKBBoDHAEaAR8BCgIWAQgBHQIaAgoCGgEeARwBCgIaAR4BCgEWAQQBIAEcARoBHwEBAxYBBAEKARwBGwIcAQkBBAEaARwBGwEfAQcBFgELAhYBCQEEAQgGHAEaAQgBCwQJARUBBAEDSQABBAEFAgwBFgELAxYBCAEKAR0CIAMdARoBHQEbAQcBFgEEAQoBGgIdAhoEHQEgARkBAQEWAQYBCgIdARwBIAEWAQYBCgEaAh0CGgEhARsBGgEcAQoCFgEIAR0CGgEgAQQBHQIaAR4DGgEeAQoBFgEEASABGwEaAR8BCAMWAQYBCgEcASEBHAEbAQkBBAEaARwBIQEfAQECCwMWAQQBCAEdBBwBIQEgAQYECQELAgMBBEgAAQcBBAEFAgwBFgELAxYBBwEKAyAGCgEGARYBBAEKBB0BIAMdARoBIAEIAQsBFgEGAQoBHQEgARwBIAEWAQYBCgEaAR0BGgEKAQgCCgEIAQoBBAIWAQgBHQIaARwCCAEcBRoBHgEKARYBBAEgASEBGgEfAQgBFgELARYBBgEKARwBIQEcAR0BDAEEAR0BHAEaAR8BAQILAxYBCQIIARwCGwEcARoBCAELAwkCDAEEAQxJAAEHAQQBBQIMARYBCwIWAQsBBwEKAiABGgEIBQQCFgEEAQoBHQEgARoBCgEIAQoBHQEgAR0BHwEGAhYBBgEKAR0BIAEhASABFgEGAQoBGgEdARwBCgUEAQkBFgELAQgBIAIaARwBCAEHAQoBGgEdAhoBHQEcAQoBFgEEASABGgEdAR8BAQMWAQgBHQEhARoBHAEKAQsBBAEdARsBGgEfAQQBFgELBBYBBAEIAR0BHAEaARwBHQUJARYBAwEOAQRJAAEHAQQBBQIMARYBCwMWAQcBCgEgAQoBGwEKAwYBDQELAhYBBAEKAR0BIAEbARcBBAEIAQoBHQEgARwBHQIWAQYBCgEdASABGgEgARYBBgEKAh0BHAEKBAkBCwIWAQsBCAEgAR0BGgEcAgQBBwEXARoBHQEaAR0BHAEKARYBBAEgARoBHQEfAQgBFgEJAQgBHAMaARsBCAEWAQQBHQEhARoBHwEHAQsBCQIMAhYBCQEIASABGwEaAR4BCgELAgkBBgIJAQMBDEoAAQcBBAEFAgwBFgELAxYBBwEKAiABHAEIBxYBBAEKAR0BFwEaAQoBCQEEAQgCHQEgAR8BCAEWAQYBCgEdASABGgEgARYBBgEKAh0BGwEeBCABHQEgAQYBFgEIASACHQEeAQUBCQEEAQgEHQEcAQoBFgEEARcBGgEdAhwBHQEbARwEGgEKAQYBFgEHAR0CGgIcAxoBIQEdAQYBFgEHASABIQEaAR8BCgMJAQYBDQEDAQ4BAUoAAQEBBAEFAgwBFgELAxYBBwEKAiABHAEIBxYBBAEKASABCgEhAQoBFgEGAQcBCgEgASMBGgEcAQsBDQEKAiABGgEgARYBBgEKAx0BGgEhBBoBHwEdAQsBCAEgAR0BIAEcAQUBFgEGAQQBCgEaAh0BHAEKARYBBAEjARoBHQEaARsBHAEaAh0CGgEKAQgCFgEEAR0FGgEhARwBGwEfARcBFgEEASACGgEfAQoDCQEGAQ0CA0sAAQcBBAEFAgwBFgELAxYBBAEKAR0BIAEaAQgBFgMLAxYBBAEKAR0BIAEaAQgBFgELAQQBBwEKAiABHAEGAQUBCAIgARoBCgEWAQYBCAEaCR0BFwEJAQcBIAEdASABHQEJARYBCwEEAQgBIAEaAR0BGgEIARYBBAEKBxoBHQEgAQoBCAEJAhYBBAEKASEIGgEXARYBBAEgARsBGgEeAQoDCQEGAQ0BA0wAAQcBBAEFAgwBFgELAxYCCAMKAQYBFgMLAxYBBAIIAgoBBAIWAQkBBAEIAwoBCQEGAwgBCgEHARYBBgIICAoCCAEWAQQBCAIKAQgBCwIWAQkBBAEHAQgCCgEEARYBBAIIBgoBCAEHAQQBDQMWAQQCCAgKAQgBFgEEAwoBIAEHAQwCCQEGAQUBA0wAAQcBBAEFAgwFFgEEAQgBBAEBAQQBDAQLAxYBBgEHAwQBCwMWAQYEBAEWAQkBCAMEAQkBFgEMCwQBCQEWAQYDBAEGBBYBBgQEAQsBFgEJCQQBBgELARYBCwIWAQkKBAEJARYBBgEIAQQBAQEIAQYFCQEETQABBAEFAQ4BDAUWAQkBBAIGAQwGCwMWAgYBDQEMBRYCCQEFAQwCFgEJAgYBCQMWBwkCBQIJAhYBCwMJAgsEFgEJAQUBCQELAxYBCQIFAQ0CBQIJAQwCFgILAxYCCQMFAg0BBQEJAQwDFgMGBQkBCwEMAQRNAAEEAQUCDgkWBwsHFgELIhYCCxQWBAsMFgILAxYBCwEWAQsECQEWAQ4BA00AAQQBDQEOAQIBDAcWBQsIFgMLBhYBCwUWAwsMFgELBRYECwUWAgsKFgMLAQkCCwsWAQsBDAILAxYBCwQJAQsBDAEDAQRNAAEEAQYBAwICARUEFgYLARYCDAQWBgsDFgQLAxYFCwcWBgsCFgULBRYRCwMWCgsCCQEMBAsDCQELARYBFQEDAQ5OAAEBAQQBAwETAQ8BAwEVCRYCCQEMAQkFFgELBxYCCwQWAwsJFgQLBRYCCwIWAQsFFgELBRYHCwMWAgwEFgoLAhYECwIWAQwBAwIOTgABAQEEAQMBAgEPAQIBDgEMBhYBDAEFAQkCFgEMAQ4BDAUWAQwBCQIMARUDFgELAQwFFgELAQwMFgEMARUEFgEMAQkBDgIMBBYBFQIMCBYBFQEMAQkCDgEMAQkBFQsWARUGFgEVAQ4BAwEMARZQAAEBAQQBAwICAQ4DDAEJAQwBCQIOARUFFgIMAgkCDgEMARYBFQEMAg4CCQMMBA4BCQQMCQkHDgEMAhYBDAUOAwwFCQQOAQwBFQIWARUBDAIOAgkFDgUDAw4DAwEMARYBBFEAAgQBBQIOBRUEFgEMAQYBCQUWAhUMFgMVBxYEFQYWBBUGFgMVBRYFFQoWBBUCDgUDAgIDEwICAQ4BFQEEUgABAQIEAQYBBQEMARUGFgENAgQBBgENAQwGFgEVAQkBCyEWARUBDBQWAQwBCQEMBRYEFQYOAgICEwECAg4BBFQAAQEDBAIGAQUCCQEFAQYBBAIBBAQBBgENAwkCBgEEAgYECQIFAgkBDAUJAwwCCwUMAgkEDAEJAQUCBgEFAgkDDAMJAwwBCwQMAQkBBQQGAQ0BCQYMAQkEDgEFAg4EAwEGAQdWAAEHAQEHBAQAAQESBA0GAQ0gBgYEDAYDBAMGAQQBAWcAAQEEBAEBAgcBAREEDgYLBAIGAQQFBhsEAQFzAAEBMwQEAQ8EAwEBB3sAAgcXBAMBBAQBAQYEBQEBBwYACQeLAA4H/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD4AA=="};
// ============ 420 FRIENDLY — guided facility walkthrough ============
// 1 unit = 1 metre. Lot 40 x 24 m, street to the south (z = +12).
// Front block (z 2..12), two storeys: dispensary | double-height lobby | merch,
// with the content studio above. Back block (z -12..2): veg, flower, dry,
// cure + lab + vault, fulfilment. The camera walks the whole building.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(width, height);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x4a3f4a, 120, 330);
const camera = new THREE.PerspectiveCamera(62, width / height, 0.08, 700);
scene.add(camera);

const H1 = 4.2, F2 = 4.5, H2 = 8.2, WT = 0.2, PI = Math.PI;

// ---------- sky + neutral studio environment (reflections, soft fill) ----------
function gradTex(stops) {
  const c = document.createElement("canvas"); c.width = 4; c.height = 256;
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
  stops.forEach((s) => gr.addColorStop(s[0], s[1]));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
scene.add(new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), new THREE.MeshBasicMaterial({
  map: gradTex([[0, "#141d3a"], [0.3, "#3a3f72"], [0.43, "#b0708a"], [0.495, "#ffb37a"], [0.52, "#3a2f33"], [1, "#17191c"]]),
  side: THREE.BackSide, fog: false })));
{
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.MeshBasicMaterial({
    map: gradTex([[0, "#ffffff"], [0.35, "#d9d6cf"], [0.5, "#a9a69f"], [0.62, "#8a8780"], [1, "#77746e"]]), side: THREE.BackSide })));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.03).texture;
  scene.environmentIntensity = 0.8;
}

// ---------- materials ----------
const sm = (color, rough = 0.85, metal = 0, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...o });
const em = (color, k = 2.5) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: k, roughness: 0.6 });
const M = {
  wall: sm(0xf1efe9, 0.92), ext: sm(0xdcd8cf, 0.9), white: sm(0xf7f6f2, 0.6), ceil: sm(0xf4f3ee, 0.95, 0, { emissive: 0xf4f3ee, emissiveIntensity: 0.28 }),
  charcoal: sm(0x25292a, 0.45, 0.35), black: sm(0x0c0d0e, 0.3, 0.4),
  walnut: sm(0x6f4e33, 0.55), oak: sm(0xc7a981, 0.5), stone: sm(0xe9e5db, 0.22), terrazzo: sm(0xd9d5ca, 0.35),
  epoxy: sm(0xcfd2cf, 0.3), steel: sm(0xb9bdc1, 0.28, 0.9), vault: sm(0x4a5157, 0.35, 0.8),
  chrome: sm(0x1f9a4a, 0.2, 0.85, { emissive: 0x0c3d1e, emissiveIntensity: 0.5 }), brass: sm(0xb08d3c, 0.3, 0.9),
  glass: new THREE.MeshStandardMaterial({ color: 0xbfe3da, transparent: true, opacity: 0.1, roughness: 0.05, depthWrite: false }),
  greenFab: sm(0x12752f, 0.95), carpet: sm(0x2e3231, 1), rug: sm(0x9a958a, 1), moss: sm(0x2c6a35, 1),
  leafDark: sm(0x1e6b2c, 1), leaf: sm(0x2f8f3f, 1), trunk: sm(0x6b5236, 1), pot: sm(0x202222, 0.8),
  kraft: sm(0xb9925a, 0.9), asphalt: sm(0x1f2225, 1), concrete: sm(0x9c9a94, 0.9), yellow: sm(0xe2b93b, 0.7),
  tint: sm(0xffffff, 0.9), cyc: sm(0xfbfbf8, 0.95, 0, { side: THREE.DoubleSide }), mirror: sm(0xdfe4e6, 0.04, 1),
  ledWhite: em(0xfff4e2, 3), ledCool: em(0xe4f1ff, 2.1), ledPink: em(0xffc2e4, 2.2), ledWarm: em(0xffd9a0, 2.6),
  screen: em(0x6fa8d8, 0.8), ledGreen: em(0x38d16e, 2.2), ledRed: em(0xff3b30, 2.4),
};

// ---------- builders ----------
const UB = new THREE.BoxGeometry(1, 1, 1);
function box(w, h, d, x, y, z, m, cast = true) {
  const o = new THREE.Mesh(UB, m); o.scale.set(w, h, d); o.position.set(x, y + h / 2, z);
  o.castShadow = cast; o.receiveShadow = true; scene.add(o); return o;
}
function cyl(rt, rb, h, x, y, z, m, seg = 20) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y + h / 2, z);
  o.receiveShadow = true; scene.add(o); return o;
}
const _d = new THREE.Object3D(), _c = new THREE.Color();
function inst(geo, m, list) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, m, list.length);
  list.forEach((t, i) => {
    _d.position.set(t.x, t.y, t.z); _d.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
    _d.scale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1); _d.updateMatrix(); im.setMatrixAt(i, _d.matrix);
    if (t.c !== undefined) im.setColorAt(i, _c.set(t.c));
  });
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im;
}
// instanced box entry: y0 is the base, like box()
const B = (w, h, d, x, y0, z, c, ry) => ({ x, y: y0 + h / 2, z, sx: w, sy: h, sz: d, c, ry });
const ibox = (m, list) => inst(UB, m, list);

function doorFrame(axis, p, c, w, y0, h, staff) {
  const m = staff ? M.chrome : M.charcoal, t = 0.07, dp = WT + 0.08;
  if (axis === "x") { box(dp, h, t, p, y0, c - w / 2, m, false); box(dp, h, t, p, y0, c + w / 2, m, false); box(dp, t, w + t, p, y0 + h, c, m, false); }
  else { box(t, h, dp, c - w / 2, y0, p, m, false); box(t, h, dp, c + w / 2, y0, p, m, false); box(w + t, t, dp, c, y0 + h, p, m, false); }
}
// a wall on the plane x = const, running along z, with door openings
function wallX(x, z0, z1, y0, y1, m, ops = []) {
  let c = z0; ops = ops.slice().sort((a, b) => a.c - b.c);
  for (const o of ops) {
    const a = o.c - o.w / 2, b = o.c + o.w / 2;
    if (a > c) box(WT, y1 - y0, a - c, x, y0, (a + c) / 2, m);
    if (y0 + o.h < y1) box(WT, y1 - y0 - o.h, o.w, x, y0 + o.h, o.c, m);
    doorFrame("x", x, o.c, o.w, y0, o.h, o.staff); c = b;
  }
  if (z1 > c) box(WT, y1 - y0, z1 - c, x, y0, (z1 + c) / 2, m);
}
function wallZ(z, x0, x1, y0, y1, m, ops = []) {
  let c = x0; ops = ops.slice().sort((a, b) => a.c - b.c);
  for (const o of ops) {
    const a = o.c - o.w / 2, b = o.c + o.w / 2;
    if (a > c) box(a - c, y1 - y0, WT, (a + c) / 2, y0, z, m);
    if (y0 + o.h < y1) box(o.w, y1 - y0 - o.h, WT, o.c, y0 + o.h, z, m);
    doorFrame("z", z, o.c, o.w, y0, o.h, o.staff); c = b;
  }
  if (x1 > c) box(x1 - c, y1 - y0, WT, (x1 + c) / 2, y0, z, m);
}

// ---------- text ----------
function textTex(lines, o = {}) {
  const w = o.w || 1024, h = o.h || 256, c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); }
  if (o.plate) {
    const r = 26; g.fillStyle = "rgba(14,18,16,0.9)"; g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.closePath(); g.fill();
    g.fillStyle = "#1fa84f"; g.fillRect(0, h * 0.2, 10, h * 0.6);
  }
  g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach((L) => {
    { const fam = "px Montserrat, 'Helvetica Neue', Arial, sans-serif", wt = (L.weight || "800") + " "; let fs = L.size; g.font = wt + fs + fam;
      const mw = w * (o.plate ? 0.9 : 0.93), tw = g.measureText(L.t).width; if (tw > mw) { fs = Math.floor(fs * mw / tw); g.font = wt + fs + fam; } }
    g.fillStyle = L.color || "#f4f3ef"; g.fillText(L.t, w / 2, L.y * h);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function sign(lines, pw, ph, x, y, z, rotY, o = {}) {
  const tex = textTex(lines, { w: 1024, h: Math.max(64, Math.round(1024 * ph / pw)), bg: o.bg });
  const m = o.glow
    ? new THREE.MeshBasicMaterial({ map: tex, transparent: !o.bg })
    : new THREE.MeshStandardMaterial({ map: tex, transparent: !o.bg, roughness: 0.6 });
  if (o.glow) m.color.setScalar(o.glow);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), m); p.position.set(x, y, z); p.rotation.y = rotY || 0; scene.add(p); return p;
}

// ---------- the logo (Otis's own file, carried as pixels; see LOGO above) ----------
function logoCanvas() {
  const bin = atob(LOGO.rle), src = document.createElement("canvas"); src.width = LOGO.w; src.height = LOGO.h;
  const g = src.getContext("2d"), img = g.createImageData(LOGO.w, LOGO.h); let p = 0;
  for (let i = 0; i < bin.length; i += 2) {
    const n = bin.charCodeAt(i), k = bin.charCodeAt(i + 1), c = LOGO.pal[k];
    for (let j = 0; j < n; j++) { img.data[p++] = c[0]; img.data[p++] = c[1]; img.data[p++] = c[2]; img.data[p++] = k ? 255 : 0; }
  }
  g.putImageData(img, 0, 0);
  const big = document.createElement("canvas"); big.width = big.height = 768;
  const bg = big.getContext("2d"); bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = "high"; bg.drawImage(src, 0, 0, 768, 768);
  return big;
}
function logoHi() { const c = document.createElement("canvas"); c.width = c.height = 1024; c.getContext("2d").drawImage(globalThis.__logoImg, 0, 0, 1024, 1024); return c; }
const logoTex = new THREE.CanvasTexture(globalThis.__logoImg ? logoHi() : logoCanvas()); logoTex.colorSpace = THREE.SRGBColorSpace; logoTex.anisotropy = 8;
function logoPanel(size, x, y, z, rotY, glow) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: logoTex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide }));
  p.material.color.setScalar(glow >= 0.9 ? 1.2 : glow <= 0.1 ? 0.5 : 1.0);
  p.position.set(x, y, z); p.rotation.y = rotY || 0; scene.add(p); return p;
}

// reusable lists for instanced things
const led = [], ledC = [], ledP = [], ledW = [], scr = [], slats = [], posts = [], stacks = [], hang = [], jars = [], cartons = [], yl = [];
const HOOD = [0x1d2320, 0x1f2a44, 0x8a8f8a, 0x7a1f24, 0xf1efe9, 0x12752f];

// =====================================================================
// SITE
// =====================================================================
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), M.asphalt); g.rotation.x = -PI / 2; g.position.y = -0.06; g.receiveShadow = true; scene.add(g);
  box(46, 0.06, 7, 0, -0.06, 15.4, M.concrete, false);
  const stripes = []; for (let i = 0; i < 14; i++) stripes.push(B(0.12, 0.012, 5.2, -18.2 + i * 2.8, -0.06, 23));
  ibox(sm(0xe8e8e0, 0.9), stripes);
  const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 20), tyreM = sm(0x101112, 0.85, 0.1), rimM = sm(0xb9bcc0, 0.3, 0.9);
  const car = (x, col) => { const paint = sm(col, 0.28, 0.6);
    box(1.88, 0.5, 4.5, x, 0.3, 23, paint); box(1.9, 0.1, 4.56, x, 0.26, 23, M.black, false);
    box(1.7, 0.2, 2.5, x, 0.8, 22.85, paint, false); box(1.62, 0.36, 2.3, x, 0.98, 22.85, M.black, false); box(1.66, 0.05, 2.2, x, 1.34, 22.85, paint, false);
    for (const sx of [-1, 1]) for (const sz of [-1.45, 1.45]) { const w = new THREE.Mesh(tyre, tyreM); w.rotation.z = PI / 2; w.position.set(x + sx * 0.86, 0.34 - 0.06, 23 + sz); w.castShadow = true; scene.add(w);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 16), rimM); r.rotation.z = PI / 2; r.position.copy(w.position); scene.add(r); }
    box(0.34, 0.1, 0.04, x - 0.62, 0.58, 20.74, M.ledWarm, false); box(0.34, 0.1, 0.04, x + 0.62, 0.58, 20.74, M.ledWarm, false);
    box(0.4, 0.09, 0.04, x - 0.6, 0.6, 25.24, sm(0x7a0d12, 0.4, 0.2), false); box(0.4, 0.09, 0.04, x + 0.6, 0.6, 25.24, sm(0x7a0d12, 0.4, 0.2), false); };
  car(-16.8, 0x1d2320); car(-11.2, 0xe9e5db); car(11.2, 0x7a1f24); car(16.8, 0x1f2a44);
  const palm = (x, z, h) => {
    cyl(0.16, 0.26, h, x, 0, z, M.trunk, 10);
    const fr = [], fd = []; const N = 16;
    for (let i = 0; i < N; i++) { const a = i / N * PI * 2 + x * 0.37, low = i % 2, k = (low ? 0.86 : 1) * (0.93 + 0.12 * Math.sin(i * 2.4 + x)), d0 = low ? 0.18 : -0.3, list = low ? fd : fr;
      let r = 0.12, y = h - (low ? 0.28 : 0.08);
      [[1.5, d0, 0.44], [1.35, d0 + 0.5, 0.38], [1.15, d0 + 1.0, 0.26], [0.8, d0 + 1.45, 0.14]].forEach(([len, tilt, wd]) => { const L = len * k, dx = Math.cos(tilt) * L, dy = -Math.sin(tilt) * L;
        list.push({ x: x + Math.cos(a) * (r + dx / 2), y: y + dy / 2, z: z + Math.sin(a) * (r + dx / 2), sx: wd, sy: 0.04, sz: L * 1.04, ry: -a + PI / 2, rx: tilt }); r += dx; y += dy; }); }
    ibox(M.leaf, fr); ibox(M.leafDark, fd); cyl(0.3, 0.2, 0.5, x, h - 0.45, z, M.trunk, 10);
  };
  palm(-23, 16, 7.4); palm(-13, 17.8, 6.3); palm(13, 17.8, 6.6); palm(23, 15.5, 7); palm(-25, -15, 6); palm(25, -15, 6.4);
  for (const s of [-1, 1]) { box(13, 0.5, 0.7, s * 12.8, 0, 13.1, M.charcoal); box(12.8, 0.42, 0.55, s * 12.8, 0.5, 13.1, M.leafDark, false); }
  const bol = [], cap = []; for (let x = -18; x <= 18; x += 4) { if (Math.abs(x) < 3) continue; bol.push({ x, y: 0.4, z: 18.6, sx: 0.16, sy: 0.8, sz: 0.16 }); cap.push(B(0.2, 0.05, 0.2, x, 0.8, 18.6)); }
  ibox(M.charcoal, bol); ibox(M.ledWarm, cap);
  // pylon sign
  box(0.7, 6.4, 0.7, 25, 0, 19.5, M.charcoal); box(4.7, 4.7, 0.5, 25, 6.2, 19.5, M.charcoal);
  box(4.9, 0.1, 0.6, 25, 6.15, 19.5, M.chrome, false); box(4.9, 0.1, 0.6, 25, 10.85, 19.5, M.chrome, false);
  logoPanel(4.3, 25, 8.55, 19.77, 0, 0.9); logoPanel(4.3, 25, 8.55, 19.23, PI, 0.9);
}

// =====================================================================
// SHELL
// =====================================================================
// floors
box(10, 0.06, 10, 0, -0.06, 7, M.stone, false);
box(15, 0.06, 10, -12.5, -0.06, 7, M.terrazzo, false);
box(15, 0.06, 10, 12.5, -0.06, 7, M.oak, false);
box(40, 0.06, 14, 0, -0.06, -5, M.epoxy, false);
// exterior walls
wallX(-20, -12.1, 2, 0, F2, M.ext); wallX(-20, 2, 12.1, 0, H2 + 0.3, M.ext);
wallX(20, -12.1, 2, 0, F2, M.ext); wallX(20, 2, 12.1, 0, H2 + 0.3, M.ext);
wallZ(-12, -20, 20, 0, F2, M.ext);
wallZ(2, -20, 20, F2, H2, M.wall);
// roofs (their undersides are the ceilings) + fascia
box(40.4, 0.3, 14.2, 0, H1, -5, M.ceil); box(40.4, 0.3, 10.2, 0, H2, 7, M.ceil);
box(40.6, 0.55, 0.3, 0, H2 - 0.05, 12.1, M.charcoal); box(40.6, 0.06, 0.34, 0, H2 - 0.14, 12.1, M.chrome, false);
box(40.6, 0.45, 0.25, 0, H1 + 0.1, -12.1, M.charcoal); box(0.25, 0.45, 14.3, -20.1, H1 + 0.1, -5, M.charcoal); box(0.25, 0.45, 14.3, 20.1, H1 + 0.1, -5, M.charcoal);
for (const x of [-12, -4, 6]) { box(2.2, 1.3, 1.5, x, F2, -6, M.steel); cyl(0.5, 0.5, 0.12, x, F2 + 1.3, -6, M.charcoal); }
// upper floors of the two wings + the bridge across the atrium
box(15, 0.3, 10, -12.5, H1, 7, M.ceil); box(15, 0.03, 10, -12.5, F2 - 0.01, 7, M.carpet, false);
box(15, 0.3, 10, 12.5, H1, 7, M.ceil); box(15, 0.03, 10, 12.5, F2 - 0.01, 7, M.oak, false);
box(10, 0.3, 1.5, 0, H1, 2.75, M.ceil); box(10, 0.03, 1.5, 0, F2 - 0.01, 2.75, M.stone, false);
box(8.5, 1.05, 0.03, -0.75, F2, 3.48, M.glass, false); box(8.5, 0.04, 0.07, -0.75, F2 + 1.05, 3.48, M.steel, false);
// interior walls
wallZ(2, -20, 20, 0, H1, M.wall, [{ c: -19, w: 1.4, h: 2.4, staff: 1 }, { c: 14, w: 1.4, h: 2.4, staff: 1 }]);
wallX(-5, 2, 12, 0, F2, M.wall, [{ c: 7.25, w: 2.6, h: 2.8 }]); wallX(-5, 2, 12, F2, H2, M.wall, [{ c: 2.85, w: 1.3, h: 2.4 }]);
wallX(5, 2, 12, 0, F2, M.wall, [{ c: 10.7, w: 1.8, h: 2.8 }]); wallX(5, 2, 12, F2, H2, M.wall, [{ c: 2.85, w: 1.3, h: 2.4 }]);
wallX(0, -12, 2, 0, H1, M.wall, [{ c: -8, w: 1.4, h: 2.4, staff: 1 }]);
wallX(8, -12, 2, 0, H1, M.wall, [{ c: -2, w: 1.4, h: 2.4, staff: 1 }]);
wallZ(-5, -20, 8, 0, H1, M.wall, [{ c: -19, w: 1.4, h: 2.4, staff: 1 }, { c: 4, w: 1.4, h: 2.4, staff: 1 }]);

// south facade: curtain wall, entrance, canopy, sign
{
  for (let x = -20; x <= 20.01; x += 2.5) { if (Math.abs(x) < 0.1) box(0.1, H2 - 2.8, 0.16, 0, 2.8, 12, M.charcoal); else box(0.1, H2, 0.16, x, 0, 12, M.charcoal); }
  for (const s of [-1, 1]) {
    box(15, 0.25, 0.2, s * 12.5, 0, 12, M.charcoal); box(15, 0.7, 0.22, s * 12.5, 4.0, 12, M.charcoal);
    box(15, 3.75, 0.04, s * 12.5, 0.25, 12, M.glass, false); box(15, 3.4, 0.04, s * 12.5, 4.7, 12, M.glass, false);
    box(3.8, H2 - 0.1, 0.04, s * 3.1, 0, 12, M.glass, false);
    box(0.09, 2.8, 0.18, s * 1.2, 0, 12, M.charcoal); box(0.04, 2.6, 1.15, s * 1.16, 0.05, 11.42, M.glass, false); box(0.03, 0.5, 0.03, s * 1.1, 0.95, 11.0, M.steel, false);
  }
  box(10, 0.1, 0.18, 0, 2.8, 12, M.charcoal); box(2.4, H2 - 2.9 - 0.1, 0.04, 0, 2.9, 12, M.glass, false);
  box(7.4, 0.22, 3.2, 0, 3.0, 13.6, M.charcoal); box(7.5, 0.06, 0.06, 0, 3.08, 15.22, M.chrome, false);
  led.push(B(6.4, 0.03, 0.12, 0, 2.97, 14.6)); cyl(0.07, 0.07, 3, -3.4, 0, 15, M.steel, 12); cyl(0.07, 0.07, 3, 3.4, 0, 15, M.steel, 12);
  box(6.6, 6.2, 0.3, 0, H2 + 0.2, 12.25, M.charcoal);
  box(6.8, 0.12, 0.4, 0, H2 + 0.2, 12.28, M.chrome, false); box(6.8, 0.12, 0.4, 0, H2 + 6.3, 12.28, M.chrome, false);
  logoPanel(5.6, 0, H2 + 3.3, 12.43, 0, 1.25);
}

// =====================================================================
// LOBBY — double-height atrium
// =====================================================================
{
  // walnut slat feature wall, both storeys, logo panel on the upper half
  box(9.8, 4.2, 0.04, 0, 0, 2.13, M.charcoal, false); box(9.8, 3.7, 0.04, 0, F2, 2.13, M.charcoal, false);
  for (let x = -4.83; x < 4.9; x += 0.14) { slats.push(B(0.055, 4.2, 0.05, x, 0, 2.18)); slats.push(B(0.055, 3.7, 0.05, x, F2, 2.18)); }
  box(4.2, 3.5, 0.08, 0, F2 + 0.12, 2.2, M.charcoal, false);
  box(4.3, 0.06, 0.1, 0, F2 + 0.1, 2.21, M.chrome, false); box(4.3, 0.06, 0.1, 0, F2 + 3.6, 2.21, M.chrome, false);
  logoPanel(3.2, 0, F2 + 1.9, 2.26, 0, 0.4);
  // reception
  box(3.6, 1.1, 0.9, 0, 0, 5.5, M.white); box(3.8, 0.06, 1.0, 0, 1.1, 5.5, M.charcoal); box(3.62, 0.08, 0.92, 0, 0, 5.5, M.chrome, false);
  logoPanel(0.9, 0, 0.62, 5.965, 0, 0.4);
  scr.push(B(0.55, 0.34, 0.03, -0.9, 1.2, 5.25), B(0.55, 0.34, 0.03, 0.9, 1.2, 5.25));
  for (const [x, z, w, d] of [[0, 4.9, 3.2, 0.06], [0, 6.1, 3.2, 0.06], [-1.6, 5.5, 0.06, 1.26], [1.6, 5.5, 0.06, 1.26]]) ledW.push(B(w, 0.05, d, x, 3.0, z));
  for (const [x, z, w, d] of [[0, 6.1, 4.2, 0.08], [0, 9.1, 4.2, 0.08], [-2.1, 7.6, 0.08, 3.08], [2.1, 7.6, 0.08, 3.08]]) ledW.push(B(w, 0.06, d, x, 6.9, z));
  // ID check podium, seating, planting, wayfinding
  box(0.5, 1.15, 0.4, -2.6, 0, 5.6, M.charcoal); sign([{ t: "21+", size: 300, y: 0.38, color: "#cdeacf" }, { t: "ID CHECK", size: 130, y: 0.8 }], 0.44, 0.3, -2.6, 0.92, 5.81, 0);
  box(0.9, 0.42, 2.4, -4.3, 0, 10.4, M.greenFab); box(0.22, 0.5, 2.4, -4.64, 0.42, 10.4, M.greenFab); cyl(0.45, 0.45, 0.36, -3.0, 0, 10.4, M.walnut, 28);
  for (const [x, z] of [[-4.3, 8.7], [4.25, 4.3]]) { cyl(0.3, 0.24, 0.7, x, 0, z, M.charcoal, 16); const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), M.leaf); s.position.set(x, 1.25, z); s.scale.y = 1.3; scene.add(s); }
  sign([{ t: "DISPENSARY", size: 96, y: 0.5 }], 2.4, 0.3, -4.87, 3.2, 7.25, PI / 2);
  sign([{ t: "MERCH  ·  CLOTHING", size: 96, y: 0.5 }], 2.4, 0.3, 4.87, 3.2, 10.7, -PI / 2);
  const inlay = logoPanel(2.4, 0, 0.006, 9.3, 0, 0.1); globalThis.__inlay = inlay; inlay.rotation.set(-PI / 2, 0, 0);
  // feature stair along the east wall, up to the bridge
  const N = 24, RUN = 6, st = [];
  for (let i = 0; i < N; i++) st.push(B(1.3, 4.5 / N, RUN / N, 4.25, 4.5 / N * i, 9.4 - RUN / N * (i + 0.5)));
  ibox(M.walnut, st);
  const str = box(1.34, 0.22, 7.5, 4.25, 0, 6.4, M.charcoal); str.position.y = 2.05; str.rotation.x = Math.atan2(4.5, RUN);
  const bal = box(0.03, 1.0, 7.5, 3.58, 0, 6.4, M.glass, false); bal.position.y = 2.95; bal.rotation.x = Math.atan2(4.5, RUN);
  sign([{ t: "LEVEL 2  ·  CONTENT STUDIO", size: 84, y: 0.5 }], 2.8, 0.3, 4.87, 3.9, 6.4, -PI / 2);
}

// =====================================================================
// DISPENSARY
// =====================================================================
{
  box(10.4, 3.0, 0.06, -12.4, 0.3, 2.15, M.walnut, false);
  for (const y of [0.95, 1.45, 1.95, 2.45]) {
    box(10.4, 0.04, 0.32, -12.4, y, 2.3, M.walnut, false); ledW.push(B(10.2, 0.02, 0.03, -12.4, y + 0.44, 2.2));
    for (let i = 0; i < 32; i++) jars.push({ x: -17.4 + i * 0.322, y: y + 0.14, z: 2.3, c: (i + Math.round(y * 2)) % 3 ? 0x2a5a34 : 0xd8cfb8 });
  }
  const menus = [["FLOWER", "INDICA  ·  SATIVA  ·  HYBRID"], ["PRE-ROLLS  ·  VAPES", "LAB-TESTED  ·  SMALL BATCH"], ["EDIBLES  ·  WELLNESS", "ASK YOUR BUDTENDER"]];
  menus.forEach((mn, i) => {
    const x = -15.6 + i * 3.2; box(3.0, 0.82, 0.06, x, 3.04, 2.16, M.black, false);
    sign([{ t: mn[0], size: 96, y: 0.36, color: "#cdeacf" }, { t: mn[1], size: 46, y: 0.72, weight: "600" }], 2.9, 0.76, x, 3.45, 2.2, 0, { bg: "#0d1210", glow: 1.25 });
  });
  box(10, 1.0, 0.9, -12.4, 0, 4.4, M.white); box(10.2, 0.05, 1.0, -12.4, 1.0, 4.4, M.charcoal); box(10.02, 0.08, 0.92, -12.4, 0, 4.4, M.chrome, false);
  for (let i = 0; i < 4; i++) { const x = -16 + i * 2.4; box(1.6, 0.3, 0.5, x, 1.05, 4.62, M.glass, false); ledW.push(B(1.5, 0.02, 0.42, x, 1.052, 4.62)); scr.push(B(0.3, 0.2, 0.03, x + 0.95, 1.1, 4.15)); }
  box(10.6, 0.2, 2.2, -12.4, 3.3, 4.2, M.walnut, false);
  for (let i = 0; i < 6; i++) { const x = -16.9 + i * 1.8; posts.push(B(0.16, 0.36, 0.16, x, 2.55, 4.5)); ledW.push(B(0.12, 0.03, 0.12, x, 2.52, 4.5)); }
  for (const x of [-14.5, -11, -7.5]) { box(1.8, 0.75, 0.8, x, 0, 10, M.walnut); box(1.8, 0.35, 0.8, x, 0.75, 10, M.glass, false); ledW.push(B(1.7, 0.02, 0.7, x, 0.752, 10)); }
  cyl(0.5, 0.5, 0.04, -18, 0.72, 10.2, M.walnut, 28); cyl(0.07, 0.1, 0.72, -18, 0, 10.2, M.steel, 10);
  for (const dz of [-0.95, 0.95]) { box(0.5, 0.44, 0.5, -18, 0, 10.2 + dz, M.greenFab); }
  box(0.08, 2.6, 5, -19.85, 0.8, 7.5, M.moss, false);
  sign([{ t: "IN CANNABIS,", size: 150, y: 0.32 }, { t: "WE TRUST.", size: 150, y: 0.7, color: "#cdeacf" }], 3.6, 1.2, -19.79, 2.2, 7.5, PI / 2, { glow: 1.5 });
  for (const z of [7, 9.6]) for (const x of [-16.5, -12.5, -8.5]) led.push(B(3.2, 0.04, 0.1, x, H1 - 0.05, z));
  sign([{ t: "STAFF ONLY  ·  CULTIVATION", size: 80, y: 0.5, color: "#25292a" }], 1.7, 0.2, -19, 2.72, 2.12, 0);
}

// =====================================================================
// CULTIVATION — veg (two-tier) and flower
// =====================================================================
const fol = [], cola = [], pots = [];
function canopy(xc, zc, len, wid, y, big) {
  const sx = big ? 0.6 : 0.42, rows = Math.max(1, Math.round(wid / (big ? 0.48 : 0.4))), cols = Math.floor(len / sx);
  for (let i = 0; i < cols; i++) for (let r = 0; r < rows; r++) {
    const x = xc - len / 2 + sx / 2 + i * sx, z = zc - wid / 2 + wid / rows * (r + 0.5), j = ((i * 7 + r * 13) % 10) / 10, k = big ? 1 : 0.6;
    pots.push({ x, y: y + 0.11 * k, z, sx: k, sy: k, sz: k });
    if (big) {
      fol.push({ x, y: y + 0.74 + j * 0.08, z, sx: 0.15, sy: 0.5 + j * 0.1, sz: 0.15, ry: j * 3, c: 0x2f8a3c });
      cola.push({ x, y: y + 1.36 + j * 0.16, z, sx: 1.05, sy: 1.2, sz: 1.05, c: 0xa9c684 });
      for (let b = 0; b < 4; b++) { const a = j * 6.28 + b * 1.571 + (i % 2) * 0.6, r = 0.15, lean = 0.42, hb = 0.44 + (b % 2) * 0.1 + j * 0.06;
        fol.push({ x: x + Math.cos(a) * r, y: y + hb, z: z + Math.sin(a) * r, sx: 0.105, sy: 0.3, sz: 0.105, rz: -Math.cos(a) * lean, rx: Math.sin(a) * lean, c: b % 2 ? 0x3f9a48 : 0x358f40 });
        cola.push({ x: x + Math.cos(a) * (r + 0.13), y: y + hb + 0.34, z: z + Math.sin(a) * (r + 0.13), sx: 0.75, sy: 0.8, sz: 0.75, rz: -Math.cos(a) * lean, rx: Math.sin(a) * lean, c: b % 2 ? 0xb7c9a0 : 0x9fc27a }); }
    } else { fol.push({ x, y: y + 0.34 + j * 0.05, z, sx: 0.095, sy: 0.15 + j * 0.04, sz: 0.095, ry: j * 3, c: 0x3aa04a });
      for (let b = 0; b < 3; b++) { const a = j * 6.28 + b * 2.094 + (r % 2) * 0.5, rr = 0.075; fol.push({ x: x + Math.cos(a) * rr, y: y + 0.25 + (b % 2) * 0.04 + j * 0.03, z: z + Math.sin(a) * rr, sx: 0.1, sy: 0.12 + j * 0.03, sz: 0.1, ry: a, rz: -Math.cos(a) * 0.3, rx: Math.sin(a) * 0.3, c: b ? 0x2f8f3f : 0x389a47 }); } }
  }
}
{
  // VEG: two benches, two tiers each
  for (const [zc, wid] of [[-3.9, 1.2], [0.3, 2.4]]) {
    for (const ty of [0.76, 2.06]) { box(16.4, 0.08, wid, -9.2, ty, zc, M.white, false); canopy(-9.2, zc, 16.4, wid - 0.1, ty + 0.08, false); }
    for (let x = -17.4; x <= -1; x += 2.05) for (const s of [-1, 1]) posts.push(B(0.06, 2.3, 0.06, x, 0, zc + s * (wid / 2 - 0.03)));
    const n = wid > 2 ? 4 : 2; for (let i = 0; i < n; i++) { const z = zc - wid / 2 + wid / n * (i + 0.5); ledC.push(B(16.2, 0.03, 0.07, -9.2, 1.97, z), B(16.2, 0.03, 0.07, -9.2, 3.3, z)); }
  }
  yl.push(B(16.6, 0.006, 0.06, -9.2, 0, -3.2), B(16.6, 0.006, 0.06, -9.2, 0, -1.0));
  const duct = cyl(0.3, 0.3, 19, -10, 3.5, -2.1, M.steel, 20); duct.rotation.z = PI / 2; duct.position.y = 3.82;
  box(0.05, 0.62, 1.5, -19.86, 1.3, -1.2, M.black, false);
  sign([{ t: "ROOM V1  ·  VEG + CLONES", size: 76, y: 0.32, color: "#cdeacf" }, { t: "76°F    65% RH    CO2 800 ppm", size: 58, y: 0.72, weight: "600" }], 1.4, 0.56, -19.83, 1.6, -1.2, PI / 2, { bg: "#0d1210", glow: 1.2 });

  // FLOWER: one single bench, one double, under full-spectrum LED
  for (const [zc, wid] of [[-6.1, 1.4], [-10.35, 2.4]]) {
    box(16.2, 0.1, wid, -9.5, 0.64, zc, M.white, false); canopy(-9.5, zc, 16.2, wid - 0.1, 0.74, true);
    for (let x = -17.5; x <= -1.4; x += 2.3) for (const s of [-1, 1]) posts.push(B(0.06, 0.64, 0.06, x, 0, zc + s * (wid / 2 - 0.05)));
    const rows = wid > 2 ? [zc - 0.6, zc + 0.6] : [zc];
    for (const z of rows) for (let x = -17; x <= -2; x += 1.5) { posts.push(B(1.15, 0.06, 1.15, x, 3.0, z)); ledP.push(B(1.02, 0.02, 1.02, x, 2.98, z)); }
  }
  yl.push(B(16.4, 0.006, 0.06, -9.5, 0, -6.9), B(16.4, 0.006, 0.06, -9.5, 0, -9.1));
  const d2 = cyl(0.32, 0.32, 19, -10, 3.5, -8, M.steel, 20); d2.rotation.z = PI / 2; d2.position.y = 3.8;
  for (let i = 0; i < 5; i++) { const f = cyl(0.36, 0.36, 0.14, -17 + i * 3.6, 2.6, -11.82, M.charcoal, 24); f.rotation.x = PI / 2; const h = cyl(0.3, 0.3, 0.15, -17 + i * 3.6, 2.6, -11.81, M.steel, 24); h.rotation.x = PI / 2; }
  box(0.05, 0.62, 1.5, -19.86, 1.3, -8, M.black, false);
  sign([{ t: "ROOM F1  ·  FLOWER", size: 80, y: 0.32, color: "#ffd1ec" }, { t: "78°F    55% RH    DAY 42", size: 62, y: 0.72, weight: "600" }], 1.4, 0.56, -19.83, 1.6, -8, PI / 2, { bg: "#120d10", glow: 1.2 });
}

// =====================================================================
// DRY ROOM · CURE + QUALITY LAB + VAULT
// =====================================================================
{
  for (const z of [-11.2, -10.2, -9.2]) {
    box(6.4, 0.04, 0.04, 4, 2.45, z, M.steel, false);
    for (let i = 0; i < 40; i++) hang.push({ x: 0.95 + i * 0.156, y: 2.05 - (i % 3) * 0.06, z: z + ((i % 4) - 1.5) * 0.03, sx: 0.07, sy: 0.7 - (i % 5) * 0.04, sz: 0.13, ry: (i % 7) * 0.45, c: i % 3 ? 0x3d5a2f : 0x4c6a38 });
  }
  for (const [x, z] of [[7.3, -6.3], [0.75, -5.75]]) { box(0.7, 1.1, 0.6, x, 0, z, M.white); box(0.5, 0.3, 0.02, x, 0.6, z + (z < -6 ? -0.31 : 0.31) * -1, M.charcoal, false); }
  led.push(B(3, 0.04, 0.1, 4, H1 - 0.05, -7.4));
  sign([{ t: "DRY ROOM D1", size: 86, y: 0.32, color: "#f6e7ab" }, { t: "60°F    60% RH    DAY 9 OF 14", size: 56, y: 0.72, weight: "600" }], 1.4, 0.56, 6.6, 1.7, -5.12, PI, { bg: "#12100b", glow: 1.2 });

  // cure shelving, west wall
  box(0.06, 2.6, 4.2, 0.14, 0.2, -2.7, M.walnut, false);
  for (const y of [0.5, 1.0, 1.5, 2.0, 2.5]) { box(0.42, 0.03, 4.0, 0.34, y, -2.7, M.steel, false); for (let i = 0; i < 13; i++) jars.push({ x: 0.36, y: y + 0.17, z: -4.55 + i * 0.31, sx: 1.15, sy: 1.4, sz: 1.15, c: i % 4 ? 0x6f8a4a : 0xc9b37a }); }
  for (let i = 0; i < 6; i++) { cartons.push(B(0.7, 0.42, 0.5, 5.6 + (i % 3) * 0.78, 0.02 + Math.floor(i / 3) * 0.44, -4.5, 0x2b2f31)); yl.push(B(0.72, 0.05, 0.52, 5.6 + (i % 3) * 0.78, 0.4 + Math.floor(i / 3) * 0.44, -4.5)); }
  // vault
  box(4.9, 3.3, 0.3, 2.65, 0, 0.55, M.vault);
  const vd = cyl(1.0, 1.0, 0.24, 2.65, 0, 0.36, M.steel, 40); vd.rotation.x = PI / 2; vd.position.y = 1.5;
  const vr = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.07, 10, 48), M.brass); vr.position.set(2.65, 1.5, 0.36); scene.add(vr);
  const wh = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 10, 36), M.brass); wh.position.set(2.65, 1.5, 0.2); scene.add(wh);
  for (let i = 0; i < 3; i++) { const sp = box(0.76, 0.05, 0.05, 2.65, 0, 0.2, M.brass, false); sp.position.y = 1.5; sp.rotation.z = i * PI / 3; }
  const bolts = []; for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; bolts.push({ x: 2.65 + Math.cos(a) * 0.82, y: 1.5 + Math.sin(a) * 0.82, z: 0.225, sx: 0.09, sy: 0.09, sz: 0.06 }); }
  ibox(M.brass, bolts);
  box(0.16, 0.26, 0.04, 4.35, 1.3, 0.38, M.black, false); box(0.1, 0.04, 0.05, 4.35, 1.47, 0.375, M.ledGreen, false);
  sign([{ t: "VAULT  ·  LIMITED ACCESS", size: 86, y: 0.5, color: "#e9e5db" }], 2.6, 0.26, 2.65, 2.95, 0.39, PI);
  // quality lab bench
  box(2.2, 0.9, 0.8, 6.6, 0, 1.45, M.white); box(2.3, 0.04, 0.9, 6.6, 0.9, 1.45, M.steel);
  box(0.34, 0.06, 0.34, 6.0, 0.94, 1.4, M.charcoal); cyl(0.13, 0.13, 0.02, 6.0, 1.0, 1.4, M.steel, 20);
  cyl(0.05, 0.07, 0.4, 6.7, 0.94, 1.5, M.charcoal, 12); box(0.2, 0.08, 0.26, 6.7, 1.28, 1.42, M.charcoal);
  scr.push(B(0.6, 0.38, 0.03, 7.3, 1.05, 1.75));
  sign([{ t: "QUALITY LAB", size: 110, y: 0.5, color: "#25292a" }], 1.6, 0.24, 6.6, 2.5, 1.88, PI);
  led.push(B(3, 0.04, 0.1, 4, H1 - 0.05, -2.2), B(0.1, 0.04, 2.4, 6.6, H1 - 0.05, 0.4));
}

// =====================================================================
// FULFILMENT · LOADING
// =====================================================================
{
  for (const x of [10.5, 13.5, 16.5]) {
    box(2.4, 0.05, 1.0, x, 0.88, -6.5, M.oak); for (const [dx, dz] of [[-1.1, -0.42], [1.1, -0.42], [-1.1, 0.42], [1.1, 0.42]]) posts.push(B(0.05, 0.88, 0.05, x + dx, 0, -6.5 + dz));
    for (let i = 0; i < 3; i++) cartons.push(B(0.46, 0.34 - i * 0.05, 0.4, x - 0.8 + i * 0.75, 0.93, -6.55, 0xb9925a));
    scr.push(B(0.42, 0.28, 0.03, x + 0.85, 1.0, -6.85));
  }
  // roller conveyor to the dock
  box(4.4, 0.06, 0.7, 11.2, 0.74, -9.2, M.steel); for (const x of [9.2, 11.2, 13.2]) posts.push(B(0.06, 0.74, 0.6, x, 0, -9.2));
  const rollers = []; for (let i = 0; i < 20; i++) rollers.push({ x: 9.15 + i * 0.216, y: 0.84, z: -9.2, rx: PI / 2, sx: 1, sy: 1, sz: 1 });
  inst(new THREE.CylinderGeometry(0.045, 0.045, 0.64, 10), M.steel, rollers);
  cartons.push(B(0.5, 0.36, 0.42, 10, 0.89, -9.2, 0xb9925a), B(0.44, 0.3, 0.4, 11.4, 0.89, -9.2, 0xb9925a), B(0.5, 0.4, 0.44, 12.7, 0.89, -9.2, 0xb9925a));
  // dock door
  box(4.5, 3.3, 0.08, 16, 0, -11.86, sm(0xd5d8da, 0.5, 0.4), false); for (let i = 0; i < 9; i++) posts.push(B(4.5, 0.04, 0.1, 16, 0.35 + i * 0.36, -11.84));
  box(0.14, 3.4, 0.16, 13.7, 0, -11.84, M.yellow, false); box(0.14, 3.4, 0.16, 18.3, 0, -11.84, M.yellow, false);
  sign([{ t: "DOCK 01", size: 150, y: 0.5, color: "#25292a" }], 1.4, 0.34, 16, 3.72, -11.88, 0);
  sign([{ t: "FULFILMENT", size: 150, y: 0.36, color: "#25292a" }, { t: "ONLINE ORDERS  ·  PACK  ·  SHIP", size: 60, y: 0.76, color: "#12752f", weight: "700" }], 3.2, 0.8, 10.8, 3.0, -11.88, 0);
  yl.push(B(5, 0.006, 0.08, 16, 0, -9.6), B(0.08, 0.006, 2.3, 13.5, 0, -10.75), B(0.08, 0.006, 2.3, 18.5, 0, -10.75));
  for (const [x, z] of [[15.1, -10.6], [17, -10.6]]) { box(1.2, 0.14, 1.0, x, 0, z, M.oak); for (let i = 0; i < 12; i++) cartons.push(B(0.56, 0.36, 0.46, x - 0.29 + (i % 2) * 0.58, 0.14 + Math.floor(i / 4) * 0.37, z - 0.24 + (Math.floor(i / 2) % 2) * 0.48, 0xb9925a)); }
  // pallet racking, east wall
  for (let z = -11; z <= 1.2; z += 2.4) for (const dx of [0, 0.7]) posts.push(B(0.08, 3.6, 0.08, 19.15 + dx, 0, z));
  for (const y of [0.2, 1.3, 2.4]) { box(0.06, 0.1, 12.2, 19.15, y, -4.9, M.chrome, false); for (let i = 0; i < 14; i++) cartons.push(B(0.6, 0.5 + (i % 3) * 0.12, 0.7, 19.5, y + 0.1, -10.6 + i * 0.85, i % 5 === 0 ? 0xe9e5db : 0xb9925a)); }
  // bagged merch ready to ship, south wall
  for (const y of [0.5, 1.1, 1.7, 2.3]) { box(4.4, 0.03, 0.4, 10.6, y, 1.68, M.steel, false); for (let i = 0; i < 12; i++) stacks.push(B(0.3, 0.2 + (i % 2) * 0.06, 0.32, 8.65 + i * 0.36, y + 0.03, 1.68, HOOD[(i + Math.round(y * 2)) % 6])); }
  for (const x of [11, 14, 17]) for (const z of [-8.5, -3]) led.push(B(0.12, 0.05, 2.6, x, H1 - 0.06, z));
  sign([{ t: "STAFF ONLY  ·  RETAIL FLOOR", size: 80, y: 0.5, color: "#25292a" }], 1.7, 0.2, 14, 2.72, 1.88, PI);
}

// =====================================================================
// MERCH — the clothing line's flagship floor
// =====================================================================
{
  // hanging rails on the north wall, either side of the staff door
  for (const [x0, x1] of [[5.6, 12.8], [15.2, 19.4]]) {
    box(x1 - x0, 0.04, 0.04, (x0 + x1) / 2, 1.75, 2.5, M.steel, false); box(x1 - x0, 0.05, 0.4, (x0 + x1) / 2, 2.15, 2.32, M.walnut, false);
    for (let x = x0 + 0.1, i = 0; x < x1 - 0.05; x += 0.13, i++) hang.push({ x, y: 1.3, z: 2.5, sx: 0.07, sy: 0.82, sz: 0.5, c: HOOD[Math.floor(i / 6) % 6] });
    for (let x = x0 + 0.3, i = 0; x < x1 - 0.2; x += 0.55, i++) for (let k = 0; k < 3; k++) stacks.push(B(0.4, 0.07, 0.3, x, 2.2 + k * 0.075, 2.32, HOOD[(i + k) % 6]));
  }
  sign([{ t: "ARCHIVE V.24", size: 150, y: 0.5 }], 3.4, 0.5, 9.2, 3.25, 2.12, 0, { glow: 1.6 });
  // hoodie wall, east
  box(0.06, 3.0, 7.4, 19.86, 0.3, 6.6, M.walnut, false);
  for (const y of [0.5, 1.1, 1.7, 2.3]) { box(0.42, 0.04, 7.2, 19.66, y, 6.6, M.walnut, false); ledW.push(B(0.02, 0.02, 7.1, 19.82, y + 0.54, 6.6)); for (let i = 0; i < 12; i++) for (let k = 0; k < 4; k++) stacks.push(B(0.32, 0.075, 0.44, 19.66, y + 0.04 + k * 0.08, 3.3 + i * 0.6, HOOD[(i + Math.round(y * 2)) % 6])); }
  sign([{ t: "HOODIES  ·  450GSM LOOPWHEEL FLEECE", size: 60, y: 0.5 }], 5.2, 0.34, 19.8, 3.55, 6.6, -PI / 2, { bg: "#0d1210", glow: 1.25 });
  // display tables
  [[10.6, 0], [16.6, 3]].forEach(([x, off]) => {
    box(2.4, 0.85, 1.2, x, 0, 6.5, M.white); box(2.5, 0.05, 1.3, x, 0.85, 6.5, M.walnut);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) stacks.push(B(0.4, 0.06, 0.3, x - 0.9 + i * 0.6, 0.9 + k * 0.065, 6.25, HOOD[(i + off) % 6]));
    for (let i = 0; i < 5; i++) jars.push({ x: x - 0.9 + i * 0.45, y: 0.95, z: 6.82, sx: 1.6, sy: 0.5, sz: 1.6, c: HOOD[(i + off + 1) % 6] });
  });
  // window mannequins, till, logo wall, mirror
  box(9.2, 0.25, 0.8, 14.6, 0, 11.4, M.white);
  // ---- hoodie display forms wearing the owner's designs (decals lifted from his photos) ----
function hoodieForm(x, z, o) {
  const G = new THREE.Group(); G.position.set(x, o.y0, z); G.rotation.y = o.ry === undefined ? PI : o.ry; scene.add(G);
  const col = new THREE.Color().setRGB(o.fab[0] / 255, o.fab[1] / 255, o.fab[2] / 255, THREE.SRGBColorSpace);
  if (!hoodieForm.weave) { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"), d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = 205 + Math.floor(Math.random() * 50); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } g.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); t.colorSpace = THREE.SRGBColorSpace; hoodieForm.weave = t; }
  const fab = new THREE.MeshStandardMaterial({ color: col, roughness: 1, map: hoodieForm.weave, bumpMap: hoodieForm.weave, bumpScale: 0.6 });
  const rib = fab.clone(); rib.color = col.clone().multiplyScalar(0.82);
  const add = (geo, mat, px, py, pz, sx = 1, sy = 1, sz = 1, parent = G) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const RX = 0.25, RZ = 0.135, Y0 = 0.94, Y1 = 1.5, rAt = (y) => 0.94 + (y - Y0) / (Y1 - Y0) * 0.06;
  // stand
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 40), M.steel, 0, 0.01, 0); add(new THREE.CylinderGeometry(0.016, 0.016, 0.95, 16), M.steel, 0, 0.475, 0);
  // body, hem, shoulders
  add(new THREE.CylinderGeometry(1, 0.94, Y1 - Y0, 48, 1), fab, 0, (Y0 + Y1) / 2, 0, RX, 1, RZ);
  add(new THREE.CylinderGeometry(0.93, 0.9, 0.075, 48, 1), rib, 0, Y0 - 0.03, 0, RX, 1, RZ);
  add(new THREE.SphereGeometry(1, 40, 20), fab, 0, Y1 - 0.004, 0, RX, 0.07, RZ);
  // hood: stands open behind the neck, dark inside
  { const inside = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.22), roughness: 1 });
    add(new THREE.SphereGeometry(1, 40, 24), fab, 0, Y1 + 0.095, -0.03, 0.142, 0.185, 0.125);
    const op = add(new THREE.CircleGeometry(1, 40), inside, 0, Y1 + 0.105, 0.0885, 0.09, 0.122, 1); op.rotation.x = -0.2; op.castShadow = false;
    const rm = add(new THREE.TorusGeometry(1, 0.15, 14, 48), fab, 0, Y1 + 0.105, 0.086, 0.094, 0.126, 0.07); rm.rotation.x = -0.2;
    add(new THREE.SphereGeometry(1, 32, 16), fab, 0, Y1 - 0.005, 0.05, 0.13, 0.05, 0.085); }
  // drawstrings: follow the cords in the product photo so they sit where the photo has them
  const cordM = o.cord ? sm(o.cord, 0.9) : rib, up = new THREE.Vector3(0, 1, 0);
  const seg = (A, B, r, mat) => { const d = B.clone().sub(A), m = add(new THREE.CylinderGeometry(r, r, d.length(), 8), mat, 0, 0, 0); m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(up, d.normalize()); };
  const dcl = o.decal ? { W: o.decal.width, H: o.decal.height, dw: o.dw, dh: o.dw * o.decal.height / o.decal.width, yc: o.dy || 1.325, a: Math.asin(Math.min(0.98, o.dw / 2 / RX)) } : null;
  const onBody = (px, py, lift) => { const th = -dcl.a + 2 * dcl.a * px / dcl.W, y = Math.min(Y1 + 0.03, dcl.yc + dcl.dh / 2 - py * dcl.dh / dcl.H), r = rAt(Math.min(Y1, y)) + lift;
    const pull = y > Y1 - 0.02 ? 1 - Math.min(1, (y - (Y1 - 0.02)) / 0.05) * 0.45 : 1; return new THREE.Vector3(RX * r * Math.sin(th), y, RZ * r * Math.cos(th) * pull); };
  (o.cords || []).forEach((line) => { const P = line.map(([px, py]) => onBody(px, py, 0.026)); for (let i = 0; i < P.length - 1; i++) seg(P[i], P[i + 1], i === P.length - 2 ? 0.0062 : 0.0068, i === P.length - 2 ? M.steel : cordM); });
  // kangaroo pocket (a tapered panel that follows the body)
  { const yb = 0.97, yt = 1.145, a = 0.62; add(new THREE.CylinderGeometry(rAt(yt) + 0.018, rAt(yb) + 0.03, yt - yb, 24, 1, true, -a * 0.82, a * 1.64), fab, 0, (yb + yt) / 2, 0, RX, 1, RZ);
    add(new THREE.CylinderGeometry(rAt(yt) + 0.02, rAt(yt) + 0.02, 0.008, 24, 1, true, -a * 0.82, a * 1.64), rib, 0, yt, 0, RX, 1, RZ); }
  // sleeves
  const sl = {};
  for (const s of [-1, 1]) { const tilt = s * 0.085, top = new THREE.Vector3(s * (RX + 0.004), Y1 - 0.062, 0), L = 0.6;
    const arm = new THREE.Group(); arm.position.copy(top); arm.rotation.z = tilt; G.add(arm);
    add(new THREE.SphereGeometry(0.071, 24, 16), fab, 0, 0, 0, 1, 1, 0.95, arm);
    add(new THREE.CylinderGeometry(0.071, 0.056, L, 24, 1), fab, 0, -L / 2, 0, 1, 1, 0.92, arm);
    add(new THREE.CylinderGeometry(0.051, 0.048, 0.07, 24, 1), rib, 0, -L - 0.03, 0, 1, 1, 0.92, arm); sl[s] = arm; }
  // chest print wrapped onto the body
  if (o.decal) { const t = new THREE.Texture(o.decal); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
    const dw = o.dw, dh = dw * o.decal.height / o.decal.width, yc = o.dy || 1.325, a = Math.asin(Math.min(0.98, dw / 2 / RX));
    const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    add(new THREE.CylinderGeometry(rAt(yc + dh / 2) + 0.012, rAt(yc - dh / 2) + 0.012, dh, 40, 1, true, -a, 2 * a), m, 0, yc, 0, RX, 1, RZ).castShadow = false; }
  // sleeve lettering
  if (o.sleeve) { const c = document.createElement("canvas"); c.width = 160; c.height = 640; const g = c.getContext("2d"); g.translate(80, 320); g.rotate(o.sleeve.up ? -PI / 2 : PI / 2);
    g.font = "800 112px Montserrat, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#f4f3ef"; const tw = g.measureText(o.sleeve.t).width; if (tw > 600) g.scale(600 / tw, 1); g.fillText(o.sleeve.t, 0, 6);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const h = 0.4, y = -0.33, r = (yy) => 0.071 + (0.056 - 0.071) * (-yy / 0.6) + 0.004;
    const p = add(new THREE.CylinderGeometry(r(y + h / 2), r(y - h / 2), h, 20, 1, true, 0.5 - 0.62, 1.24), m, 0, y, 0, 1, 1, 0.92, sl[1]); p.castShadow = false; }
  return G;
}

  { const Dm = globalThis.__merch;
    hoodieForm(11.3, 11.4, { y0: 0.25, fab: [161, 49, 54], decal: Dm[3], dw: 0.345, cords: [[[105, -75], [105, 108], [106, 136]], [[177, -75], [177, 108], [177, 137]]] });
    hoodieForm(13.5, 11.4, { y0: 0.25, fab: [30, 31, 34], decal: Dm[4], dw: 0.35, sleeve: { t: "INDICA", up: false }, cords: [[[94, -90], [94, 205], [94, 232]], [[194, -90], [194, 205], [194, 232]]] });
    hoodieForm(15.7, 11.4, { y0: 0.25, fab: [150, 150, 150], decal: Dm[6], dw: 0.36, cord: 0xe6dfd0, cords: [[[70, -70], [45, 0], [28, 30], [14, 62], [8, 78]], [[208, -70], [221, 0], [228, 30], [222, 62], [207, 92], [202, 103]]] });
    hoodieForm(17.9, 11.4, { y0: 0.25, fab: [30, 31, 34], decal: Dm[7], dw: 0.3, dy: 1.3, sleeve: { t: "HYBRID", up: true }, cords: [[[61, -55], [62, 105], [59, 128]], [[113, -55], [113, 100], [108, 124]]] }); }
  box(0.8, 1.0, 2.4, 6.3, 0, 6.5, M.white); box(0.9, 0.05, 2.5, 6.3, 1.0, 6.5, M.charcoal); box(0.82, 0.08, 2.42, 6.3, 0, 6.5, M.chrome, false);
  scr.push(B(0.03, 0.24, 0.34, 6.25, 1.1, 5.9));
  box(0.06, 2.5, 2.7, 5.13, 0.6, 6.5, M.charcoal, false); box(0.08, 0.06, 2.8, 5.14, 0.58, 6.5, M.chrome, false); box(0.08, 0.06, 2.8, 5.14, 3.08, 6.5, M.chrome, false);
  logoPanel(1.9, 5.18, 1.9, 6.5, PI / 2, 0.4);
  box(0.04, 2.1, 0.9, 5.12, 0.2, 8.7, M.mirror, false);
  // track lighting
  for (const z of [5, 8.6]) { box(13.6, 0.05, 0.06, 12.5, H1 - 0.12, z, M.black, false); for (let x = 6.5; x < 19.2; x += 1.6) { posts.push(B(0.12, 0.2, 0.12, x, H1 - 0.34, z)); ledW.push(B(0.09, 0.02, 0.09, x, H1 - 0.36, z)); } }
  sign([{ t: "STAFF ONLY", size: 110, y: 0.5, color: "#25292a" }], 1.1, 0.2, 14, 2.72, 2.12, 0);
}

// =====================================================================
// LEVEL 2 WEST — content studio: video stage, control desk, podcast set
// =====================================================================
{
  const y = F2;
  box(0.2, 3.5, 7.4, -19.78, y, 7, M.cyc, false); box(4.6, 0.03, 7.4, -17.4, y + 0.01, 7, M.cyc, false);
  const cove = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 7.4, 20, 1, true, -PI / 2, PI / 2), M.cyc);
  cove.rotation.x = PI / 2; cove.position.set(-18.78, y + 0.92, 7); scene.add(cove);
  for (const z of [4.5, 9.5]) { cyl(0.03, 0.03, 2.3, -14.5, y, z, M.black, 8); const sb = box(0.12, 0.95, 0.95, -14.56, y + 1.55, z, M.ledWhite, false); sb.rotation.y = z < 7 ? 0.35 : -0.35; }
  cyl(0.03, 0.03, 1.5, -13.9, y, 7, M.black, 8); box(0.42, 0.24, 0.26, -14.0, y + 1.5, 7, M.black); const lens = cyl(0.09, 0.09, 0.22, -14.3, y + 1.53, 7, M.charcoal, 16); lens.rotation.z = PI / 2;
  for (const z of [4.6, 7, 9.4]) box(5.4, 0.05, 0.05, -16.6, H2 - 0.5, z, M.black, false);
  for (const z of [4.6, 9.4]) for (const x of [-18, -16]) { posts.push(B(0.2, 0.28, 0.2, x, H2 - 0.82, z)); ledW.push(B(0.15, 0.02, 0.15, x, H2 - 0.84, z)); }
  // control desk + acoustic wall
  box(4.4, 0.05, 0.8, -14.8, y + 0.74, 2.75, M.walnut); box(4.2, 0.74, 0.06, -14.8, y, 2.45, M.charcoal);
  for (const x of [-16.2, -14.8, -13.4]) scr.push(B(1.1, 0.62, 0.03, x, y + 0.92, 2.5)); box(0.9, 0.06, 0.4, -14.8, y + 0.79, 2.95, M.black, false);
  const ac = []; for (let i = 0; i < 12; i++) for (let r = 0; r < 2; r++) { const x = -18.9 + i * 1.02; if (x > -6.6) continue; ac.push(B(0.92, 0.92, 0.06, x, y + 1.75 + r * 1.02, 2.14, (i + r) % 3 === 0 ? 0x12752f : (i + r) % 3 === 1 ? 0x25292a : 0x4a4f4d)); }
  ibox(M.tint, ac);
  // podcast set against the atrium wall: logo backdrop, round table, three seats
  box(0.08, 2.9, 4.2, -5.16, y + 0.3, 8, M.charcoal, false); box(0.1, 0.06, 4.3, -5.17, y + 0.28, 8, M.chrome, false); box(0.1, 0.06, 4.3, -5.17, y + 3.2, 8, M.chrome, false);
  logoPanel(2.3, -5.23, y + 1.85, 8, -PI / 2, 0.4);
  for (let z = 4.3; z < 5.8; z += 0.14) slats.push(B(0.05, 3.2, 0.055, -5.14, y + 0.2, z)); for (let z = 10.25; z < 11.75; z += 0.14) slats.push(B(0.05, 3.2, 0.055, -5.14, y + 0.2, z));
  cyl(1.05, 1.0, 0.06, -7.6, y + 0.72, 8, M.walnut, 36); cyl(0.14, 0.3, 0.72, -7.6, y, 8, M.charcoal, 16);
  for (const [cx, cz, r] of [[-7.6, 6.4, 0], [-7.6, 9.6, PI], [-9.25, 8, PI / 2]]) {
    box(0.55, 0.46, 0.55, cx, y, cz, M.greenFab); const bk = box(0.55, 0.55, 0.1, cx - Math.sin(r) * 0.27, y + 0.46, cz - Math.cos(r) * 0.27, M.greenFab); bk.rotation.y = r;
    const mx = -7.6 + (cx + 7.6) * 0.5, mz = 8 + (cz - 8) * 0.5; cyl(0.015, 0.015, 0.42, mx, y + 0.78, mz, M.black, 6); const mic = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), M.black); mic.position.set(mx, y + 1.23, mz); scene.add(mic);
  }
  sign([{ t: "ON AIR", size: 150, y: 0.52, color: "#ff5a4f" }], 0.9, 0.3, -5.11, y + 3.05, 4.9, -PI / 2, { bg: "#170b0a", glow: 1.7 });
  // garment rail for shoots
  box(3, 0.04, 0.04, -12.5, y + 1.7, 11, M.steel, false); for (const x of [-14, -11]) posts.push(B(0.04, 1.7, 0.04, x, y, 11));
  for (let i = 0; i < 20; i++) hang.push({ x: -13.9 + i * 0.145, y: y + 1.26, z: 11, sx: 0.07, sy: 0.8, sz: 0.48, c: HOOD[Math.floor(i / 4) % 6] });
  for (const x of [-10, -7]) led.push(B(0.1, 0.04, 3, x, H2 - 0.05, 4.2)); led.push(B(3, 0.04, 0.1, -11.5, H2 - 0.05, 10.2));
  sign([{ t: "CONTENT STUDIO", size: 120, y: 0.5, color: "#25292a" }], 2.6, 0.3, -9, y + 3.1, 2.13, 0);
}

// =====================================================================
// LEVEL 2 EAST — edit bay, creator lounge, boardroom
// =====================================================================
{
  const y = F2;
  for (const x of [9.6, 12.2, 14.8, 17.4]) {
    box(2.2, 0.05, 0.8, x, y + 0.73, 2.75, M.walnut); box(0.05, 0.73, 0.7, x - 1.05, y, 2.75, M.charcoal); box(0.05, 0.73, 0.7, x + 1.05, y, 2.75, M.charcoal);
    scr.push(B(0.95, 0.54, 0.03, x - 0.5, y + 0.9, 2.5), B(0.95, 0.54, 0.03, x + 0.5, y + 0.9, 2.5));
    box(0.5, 0.46, 0.5, x, y, 3.75, M.charcoal); box(0.5, 0.5, 0.08, x, y + 0.46, 3.98, M.charcoal);
  }
  sign([{ t: "POST-PRODUCTION", size: 120, y: 0.5, color: "#25292a" }], 2.8, 0.3, 13.5, y + 2.6, 2.13, 0);
  // lounge by the windows
  box(4.6, 0.02, 3.6, 8.6, y + 0.01, 10, M.rug, false);
  box(2.6, 0.42, 0.9, 8.6, y, 11.1, M.greenFab); box(2.6, 0.5, 0.22, 8.6, y + 0.42, 11.44, M.greenFab);
  for (const x of [7.1, 10.1]) { box(0.8, 0.4, 0.8, x, y, 9.2, M.charcoal); box(0.8, 0.45, 0.16, x, y + 0.4, 8.88, M.charcoal); }
  cyl(0.5, 0.5, 0.34, 8.6, y, 10.0, M.walnut, 28); cyl(0.02, 0.02, 1.6, 6.2, y, 11.2, M.black, 8); ledW.push(B(0.3, 0.22, 0.3, 6.2, y + 1.6, 11.2));
  // boardroom behind glass
  box(0.08, 0.06, 7, 14.8, y, 8.5, M.charcoal, false); box(5.2, 0.06, 0.08, 17.4, y, 5, M.charcoal, false);
  box(0.08, 0.08, 7, 14.8, y + 3.2, 8.5, M.charcoal, false); box(5.2, 0.08, 0.08, 17.4, y + 3.2, 5, M.charcoal, false); box(0.08, 3.2, 0.08, 14.8, y, 5, M.charcoal, false);
  box(1.4, 0.06, 4.6, 17.4, y + 0.72, 8.5, M.walnut); box(0.6, 0.72, 3.4, 17.4, y, 8.5, M.charcoal);
  const ch = []; for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { ch.push(B(0.5, 0.46, 0.5, 17.4 + s * 1.15, y, 6.7 + i * 0.9)); ch.push(B(0.08, 0.5, 0.5, 17.4 + s * 1.38, y + 0.46, 6.7 + i * 0.9)); }
  ibox(M.black, ch);
  box(0.06, 1.9, 3.3, 19.84, y + 1.1, 8.5, new THREE.MeshBasicMaterial({ color: 0x0b0d0c }), false); logoPanel(1.5, 19.79, y + 2.05, 8.5, -PI / 2, 0.45);
  ledW.push(B(0.08, 0.05, 3.6, 17.4, y + 2.3, 8.5));
  sign([{ t: "BOARDROOM", size: 130, y: 0.5 }], 0.9, 0.144, 14.77, y + 1.5, 5.5, -PI / 2, { glow: 0.72 });
  for (const x of [8, 12]) led.push(B(0.1, 0.04, 3, x, H2 - 0.05, 6.5));
}

// ---- scale figures: neutral, architect's-model people so the rooms read as in use ----
{
  const tone = { visitor: sm(0xd6d2c8, 1), staff: sm(0x35423b, 1) }, list = [];
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14);
  const G = { leg: cap(0.07, 0.66), torso: cap(0.15, 0.4), arm: cap(0.045, 0.5), head: new THREE.SphereGeometry(0.1, 20, 14), thigh: cap(0.07, 0.34), shin: cap(0.065, 0.36), fore: cap(0.045, 0.4) };
  const person = (x, z, y0, ry, kind = "visitor", pose = "stand", seat = 0.46) => {
    const g = new THREE.Group(), m = tone[kind]; g.position.set(x, y0, z); g.rotation.y = ry; scene.add(g); list.push({ x, y: y0, z });
    const add = (geo, px, py, pz, rx = 0, rz = 0, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.rotation.set(rx, 0, rz); o.scale.z = sz; o.castShadow = true; o.receiveShadow = true; g.add(o); };
    if (pose === "stand") {
      for (const s of [-1, 1]) { add(G.leg, s * 0.085, 0.4, 0); add(G.arm, s * 0.215, 1.12, 0.01, 0.04, -s * 0.07); }
      add(G.torso, 0, 1.13, 0, 0, 0, 0.68); add(G.head, 0, 1.6, 0.01);
    } else {
      const h = seat + 0.07;
      for (const s of [-1, 1]) { add(G.thigh, s * 0.085, h, 0.2, PI / 2); add(G.shin, s * 0.085, h - 0.25, 0.42); add(G.fore, s * 0.2, h + 0.38, 0.14, -0.95, -s * 0.05); }
      add(G.torso, 0, h + 0.4, 0, 0.06, 0, 0.68); add(G.head, 0, h + 0.87, 0.04);
    }
  };
  // lobby
  person(0.9, 4.72, 0, 0, "staff"); person(-4.22, 10.0, 0, PI / 2, "visitor", "sit", 0.42);
  // dispensary: two budtenders behind the counter, a customer at it, one seated by the window
  person(-15, 3.42, 0, 0, "staff"); person(-10.4, 3.42, 0, 0, "staff"); person(-12.3, 5.55, 0, PI, "visitor"); person(-18, 11.1, 0, PI, "visitor", "sit", 0.44);
  // veg room: a grower at the big bench
  person(-8.5, -1.45, 0, 0, "staff");
  // fulfilment: packers at the tables
  person(10.5, -7.5, 0, 0, "staff"); person(16.5, -7.5, 0, 0, "staff");
  // merch: a shopper at the hoodie wall, staff at the till
  person(18.55, 4.3, 0, PI / 2, "visitor"); person(5.62, 6.5, 0, PI / 2, "staff");
  // content studio: talent on the white stage, an operator at the control desk, two podcast hosts
  person(-17.5, 7, F2, PI / 2, "visitor"); person(-14.8, 3.6, F2, PI, "staff"); person(-7.6, 6.42, F2, 0, "visitor", "sit"); person(-7.6, 9.58, F2, PI, "visitor", "sit");
  // edit bay and lounge
  person(14.8, 3.74, F2, PI, "staff", "sit"); person(17.4, 3.74, F2, PI, "staff", "sit"); person(9.25, 11.02, F2, PI, "visitor", "sit", 0.42);
  globalThis.__people = list;
}

// ---------- commit the instanced lists ----------
ibox(M.ledWhite, led); ibox(M.ledCool, ledC); ibox(M.ledPink, ledP); ibox(M.ledWarm, ledW); ibox(M.screen, scr);
ibox(M.walnut, slats); ibox(M.charcoal, posts); ibox(M.tint, stacks); ibox(M.tint, hang); ibox(M.tint, cartons); ibox(M.yellow, yl);
inst(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 12), M.tint, jars);
inst(new THREE.CylinderGeometry(0.13, 0.11, 0.22, 10), M.pot, pots);
inst(new THREE.IcosahedronGeometry(1, 1), M.tint, fol);
inst(new THREE.ConeGeometry(0.07, 0.34, 6), M.tint, cola);

// =====================================================================
// LIGHTING
// =====================================================================
{
  const sun = new THREE.DirectionalLight(0xffc48a, 3.0); sun.position.set(-45, 24, 52); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 170;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; scene.add(sun);
  const spot = (col, k, px, py, pz, tx, ty, tz, ang, dist) => { const s = new THREE.SpotLight(col, k, dist, ang, 0.6, 2); s.position.set(px, py, pz); s.target.position.set(tx, ty, tz); scene.add(s, s.target); };
  const pt = (col, k, x, y, z, dist) => { const p = new THREE.PointLight(col, k, dist, 2); p.position.set(x, y, z); scene.add(p); };
  spot(0xffffff, 120, 0, H2 + 8.5, 16.5, 0, H2 + 3.3, 12.3, 0.55, 20);      // exterior sign
  pt(0xffe8c8, 34, 0, 6.6, 7.6, 18);                                          // atrium
  spot(0xffffff, 10, 0, 7.7, 5.2, 0, F2 + 1.9, 2.2, 0.6, 9);                  // lobby logo wall
  pt(0xffe2b8, 26, -12.4, 3.2, 6.2, 18);                                      // dispensary
  pt(0xffe8cc, 26, 12.5, 3.4, 6.6, 18);                                       // merch
  pt(0xe4f1ff, 12, -9.2, 3.5, -2.1, 18);                                      // veg
  pt(0xff9fd0, 16, -9.5, 2.7, -8, 20);                                        // flower
  pt(0xffd9a0, 9, 4, 3.4, -8.3, 9);                                           // dry
  pt(0xfff1e0, 12, 4, 3.4, -1.9, 9);                                          // cure + lab
  pt(0xeef4ff, 22, 14, 3.6, -5, 16);                                          // fulfilment
  spot(0xfff3e0, 90, -12.5, H2 - 0.5, 7, -19, F2 + 1.4, 7, 0.75, 12);         // video stage
  spot(0xffffff, 12, -9.2, H2 - 0.5, 8, -5.2, F2 + 1.8, 8, 0.65, 8);          // podcast backdrop
  pt(0xffe8cc, 20, 12, H2 - 0.8, 6.5, 16);                                    // edit bay + lounge
}

// =====================================================================
// THE TOUR
// =====================================================================
const CAPS = [
  ["420 FRIENDLY  ·  HEADQUARTERS", "Retail · Cultivation · Studio — California"],
  ["LOBBY  ·  RECEPTION", "Double-height atrium · ID verification"],
  ["DISPENSARY", "Licensed retail floor · consultation counter"],
  ["VEG  ·  CLONE ROOM", "Two-tier propagation · full-spectrum LED"],
  ["FLOWER ROOM", "Climate-controlled canopy"],
  ["DRY ROOM", "Hang-dry · 60°F / 60% RH"],
  ["CURE  ·  QUALITY LAB  ·  VAULT", "Batch testing · secure storage"],
  ["FULFILMENT", "Packing line · online orders · loading dock"],
  ["MERCH  ·  CLOTHING LINE", "Archive V.24 flagship floor"],
  ["ATRIUM STAIR", "Up to the content studio"],
  ["CONTENT STUDIO", "Video stage · control desk · podcast set"],
  ["EDIT BAY  ·  BOARDROOM", "Post-production · creator lounge"],
];
// [ position xyz, look-at xyz, seconds to arrive, caption ]
const e = 1.65, e2 = F2 + 1.65;
const K = [
  [34, 13, 40, 0, 7, 12, 0, 0], [20, 7, 32, 0, 8.5, 12, 6, 0], [6, 3.2, 24, 0, 9.8, 12, 5, 0], [0, 1.8, 17, 0, 5, 6, 4.5, 0],
  [0, 1.7, 12.5, 0, 5.6, 2.2, 3.5, 1], [0, 1.7, 9.5, 0, 6.2, 2.2, 3.5, 1], [-0.5, 1.68, 8, 0, 1.3, 5, 3, 1], [-2.5, e, 7.4, -9, 1.6, 6.5, 3, 1],
  [-6, e, 7.3, -13, 1.5, 4.5, 3, 2], [-10, e, 7.4, -14, 1.7, 3.2, 4, 2], [-14, e, 7.5, -17.5, 1.3, 10.4, 4, 2], [-17.5, e, 6.6, -19, 1.5, 2, 4, 2], [-19, e, 4.2, -19, 1.55, -3, 2.5, 2],
  [-19, e, 1.2, -17, 1.5, -2.5, 2.5, 3], [-19, e, -1.6, -8, 1.4, -2.2, 3, 3], [-18.6, e, -2.4, -8, 1.6, -2.2, 3.5, 3], [-19, e, -3.6, -19, 1.55, -9, 2.5, 3],
  [-19, e, -6.2, -16, 1.5, -8.2, 3, 4], [-18, e, -8, -8, 1.5, -8, 2.5, 4], [-12, e, -8, -4, 1.45, -8.4, 5, 4], [-6, e, -8, -2, 1.3, -10, 4.5, 4], [-1.6, e, -8, 3, 1.6, -8.6, 3.5, 4],
  [1.4, e, -8, 5, 2.0, -10.2, 2.5, 5], [3.6, e, -7.6, 4.5, 1.9, -10.5, 3, 5], [4, e, -6.2, 4, 1.55, -1, 2.5, 5],
  [4, e, -3.8, 2.6, 1.5, 0.4, 2.5, 6], [4.3, e, -2.4, 0.4, 1.5, -3, 3, 6], [5.6, e, -2.1, 6.8, 1.3, 1, 2.5, 6], [6.8, e, -2, 12, 1.5, -2.6, 2, 6],
  [9.4, e, -2, 14, 1.4, -6, 2.5, 7], [12.5, e, -2.6, 15.5, 1.6, -11, 3.5, 7], [14.2, e, -1.6, 18.8, 1.6, -6, 3, 7], [14, e, 0.4, 14, 1.6, 6, 2.5, 7],
  [14, e, 3.2, 13, 1.5, 8, 2.5, 8], [13.8, e, 5, 19, 1.6, 7, 3.5, 8], [15.9, e, 9.85, 16.7, 1.52, 11.4, 3.5, 8], [12.6, e, 9.9, 12.1, 1.52, 11.4, 3.5, 8], [8, e, 10.5, 3, 1.7, 10.6, 2.5, 8],
  [5.6, e, 10.7, 0, 3, 8, 2.5, 9], [4.3, 1.68, 10.5, 4.2, 3.2, 5, 2.5, 9], [4.25, 2.6, 8.2, 3, 5.2, 3, 3, 9], [4.25, 4.35, 5.8, 0, 6.3, 2.4, 3.5, 9], [4.2, 6.1, 3.5, -2, 6, 2.9, 3.5, 9],
  [2.5, e2, 2.85, -3, 3.5, 9, 3, 9], [0, e2, 2.85, 0, 2.5, 12, 3, 9], [-3, e2, 2.85, -9, 6, 3, 3, 9],
  [-6.2, e2, 2.9, -12, 5.9, 5, 2.5, 10], [-9, e2, 4.2, -15, 5.8, 7, 3, 10], [-11.5, e2, 6.6, -19, 6, 7, 3, 10], [-12, e2, 7.6, -6, 5.9, 8, 4, 10], [-10.6, e2, 7.9, -5.2, 6.25, 8, 3.5, 10],
  [-9, e2, 5, -5, 6, 2.6, 3, 10], [-6.4, e2, 2.95, 0, 6.1, 2.85, 2.5, 10], [-2, e2, 2.85, 6, 6.1, 2.9, 3, 10], [3, e2, 2.85, 9, 6, 3.2, 3.5, 10],
  [6.4, e2, 2.95, 12, 5.6, 3, 2.5, 11], [9, e2, 4.6, 14, 5.5, 2.8, 3, 11], [11.5, e2, 6.6, 9, 5.2, 10.4, 3.5, 11], [12.2, e2, 7.4, 19.5, 6.1, 8.3, 4, 11], [13.2, e2, 7.9, 19.8, 6.3, 8.5, 4, 11],
];
const pc = new THREE.CatmullRomCurve3(K.map((k) => new THREE.Vector3(k[0], k[1], k[2])), false, "centripetal");
const lc = new THREE.CatmullRomCurve3(K.map((k) => new THREE.Vector3(k[3], k[4], k[5])), false, "centripetal");
const T = [0]; for (let i = 1; i < K.length; i++) T[i] = T[i - 1] + K[i][6];
const TOTAL = T[T.length - 1], HOLD = 3, FADE = 1.2;

// captions ride with the camera
const visH = 2 * Math.tan(camera.fov * PI / 360), visW = visH * camera.aspect;
const capTex = CAPS.map((c) => textTex([{ t: c[0], size: 62, y: 0.36, color: "#ffffff" }, { t: c[1], size: 34, y: 0.73, color: "#cdeacf", weight: "600" }], { w: 1024, h: 200, plate: true }));
const hud = new THREE.Sprite(new THREE.SpriteMaterial({ map: capTex[0], transparent: true, depthTest: false, depthWrite: false, fog: false }));
{ const w = Math.min(visW * 0.88, 0.95), h = w * 200 / 1024; hud.scale.set(w, h, 1); hud.position.set(0, -visH / 2 + h / 2 + visH * 0.035, -1); hud.renderOrder = 999; camera.add(hud); }
const hintTex = [
  textTex([{ t: "TAP TO PAUSE   ·   DRAG TO LOOK AROUND", size: 40, y: 0.52, weight: "700" }], { w: 1024, h: 90, plate: true }),
  textTex([{ t: "PAUSED   ·   TAP TO RESUME", size: 40, y: 0.52, weight: "700", color: "#f6e7ab" }], { w: 1024, h: 90, plate: true }),
];
const hint = new THREE.Sprite(new THREE.SpriteMaterial({ map: hintTex[0], transparent: true, depthTest: false, depthWrite: false, fog: false }));
{ const w = Math.min(visW * 0.7, 0.7), h = w * 90 / 1024; hint.scale.set(w, h, 1); hint.position.set(0, visH / 2 - h / 2 - visH * 0.03, -1); hint.renderOrder = 999; camera.add(hint); }

let time = 0, playing = true, snap = true, yaw = 0, pitch = 0, capShown = 0, capAlpha = 0, pd = null;
const tmp = new THREE.PerspectiveCamera(), baseQ = new THREE.Quaternion(), posS = new THREE.Vector3();
const qY = new THREE.Quaternion(), qP = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
function place(dt) {
  const tt = Math.min(time, TOTAL); let i = 1; while (i < T.length - 1 && tt > T[i]) i++;
  const u = Math.min(1, Math.max(0, (tt - T[i - 1]) / (T[i] - T[i - 1]))), s = Math.min(1, (i - 1 + u) / (K.length - 1));
  pc.getPoint(s, v1); lc.getPoint(s, v2); tmp.position.copy(v1); tmp.lookAt(v2);
  if (snap) { posS.copy(v1); baseQ.copy(tmp.quaternion); snap = false; }
  else { posS.lerp(v1, 1 - Math.exp(-dt * 5)); baseQ.slerp(tmp.quaternion, 1 - Math.exp(-dt * 3.2)); }
  camera.position.copy(posS); qY.setFromAxisAngle(AY, yaw); qP.setFromAxisAngle(AX, pitch);
  camera.quaternion.copy(qY).multiply(baseQ).multiply(qP);
  return K[u >= 1 ? i : i - 1][7];
}
canvas.style.touchAction = "none";
canvas.addEventListener("pointerdown", (ev) => { pd = { t: performance.now(), lx: ev.clientX, ly: ev.clientY, moved: 0 }; });
window.addEventListener("pointermove", (ev) => {
  if (!pd) return; const dx = ev.clientX - pd.lx, dy = ev.clientY - pd.ly; pd.lx = ev.clientX; pd.ly = ev.clientY; pd.moved += Math.abs(dx) + Math.abs(dy);
  yaw += dx * 0.005; pitch = Math.max(-0.9, Math.min(0.9, pitch + dy * 0.004));
});
const release = () => { if (!pd) return; if (pd.moved < 8 && performance.now() - pd.t < 450) playing = !playing; pd = null; };
window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release);

// ---------- output: bloom, then filmic tone mapping + fade in one pass ----------
let composer = null, outMat = null;
try {
  { const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: globalThis.__msaa ?? 4 })); }
  composer.addPass(new RenderPass(scene, camera));
  if (globalThis.__GTAOPass && !globalThis.__noAO) { const sz2 = renderer.getDrawingBufferSize(new THREE.Vector2()); const ao = new globalThis.__GTAOPass(scene, camera, sz2.x, sz2.y);
    ao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 16 }); ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 8, rings: 2, samples: 16 }); ao.blendIntensity = 0.85;
    const run = ao.render.bind(ao); ao.render = (...a) => { const hid = []; scene.traverse((o) => { const m = o.material; if (o.visible && m && (o.isSprite || m.transparent || m.alphaTest > 0)) { o.visible = false; hid.push(o); } }); run(...a); hid.forEach((o) => { o.visible = true; }); };
    composer.addPass(ao); globalThis.__ao = ao; }
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.3, 0.6, 1.0));
  outMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, fade: { value: 1 } }, depthTest: false, depthWrite: false,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: "uniform sampler2D tDiffuse; uniform float fade; varying vec2 vUv;" +
      "vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }" +
      "void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; vec2 q = vUv - 0.5; c *= (1.0 - 0.55*dot(q,q)) * fade;" +
      " c = aces(c * 0.95); gl_FragColor = vec4(pow(c, vec3(1.0/2.2)), 1.0); }",
  });
  const fsScene = new THREE.Scene(), fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outMat); quad.frustumCulled = false; fsScene.add(quad);
  composer.addPass({ enabled: true, needsSwap: false, clear: false, renderToScreen: true, setSize() {}, dispose() {},
    render(r, wb, rb) { outMat.uniforms.tDiffuse.value = rb.texture; r.setRenderTarget(null); r.render(fsScene, fsCam); } });
} catch { composer = null; }

let last = performance.now();
let manual = false, videoMode = false;
function tick() {
  if (manual) return; requestAnimationFrame(tick);
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt);
}
function step(dt) { if (globalThis.__inlay && globalThis.__hide) globalThis.__inlay.visible = !(time >= globalThis.__hide[0] && time <= globalThis.__hide[1]);
  if (playing) {
    time += dt; if (time > TOTAL + HOLD) { time = 0; snap = true; }
    if (!pd) { const k = Math.exp(-dt * 1.6); yaw *= k; pitch *= k; }
  }
  const cap = place(dt);
  if (cap !== capShown) { capAlpha -= dt * 3; if (capAlpha <= 0) { capShown = cap; hud.material.map = capTex[cap]; capAlpha = 0; } }
  else capAlpha = Math.min(1, capAlpha + dt * 2.5);
  hud.material.opacity = capAlpha;
  hint.material.map = hintTex[playing ? 0 : 1];
  hint.material.opacity = videoMode ? 0 : playing ? Math.max(0, Math.min(1, time - 1.5, 9 - time)) : 1;
  const fade = Math.max(0, Math.min(1, time / FADE, (TOTAL + HOLD - time) / FADE));
  if (composer) { outMat.uniforms.fade.value = fade; if (videoMode) composer.passes[composer.passes.length - 2].strength = 0.3 - 0.2 * Math.min(1, Math.max(0, (time - 174) / 2)); composer.render(); }
  else { renderer.toneMappingExposure = fade; renderer.render(scene, camera); }
}
globalThis.__tour = { capStarts: CAPS.map((_, c) => { const j = K.findIndex((k) => k[7] === c); return j < 0 ? null : T[j]; }), hold: HOLD, K, T,
  video() { manual = true; videoMode = true; time = 0; playing = true; snap = true; yaw = 0; pitch = 0; capShown = 0; capAlpha = 0; },
  at(t) { manual = true; videoMode = true; time = t; playing = true; snap = true; yaw = 0; pitch = 0; capShown = -1; capAlpha = 0; },
  step(dt) { step(dt); return time; }, total: TOTAL,
  pos(t) { const tt = Math.min(t, TOTAL); let i = 1; while (i < T.length - 1 && tt > T[i]) i++; const u = Math.min(1, Math.max(0, (tt - T[i - 1]) / (T[i] - T[i - 1]))); const p = pc.getPoint(Math.min(1, (i - 1 + u) / (K.length - 1))); return [p.x, p.y, p.z]; },
  view(t) { manual = true; videoMode = true; hud.visible = true; time = t; playing = true; snap = true; capShown = -1; capAlpha = 0; for (let i = 0; i < 12; i++) step(1 / 6); },
  shot(px, py, pz, lx, ly, lz) { manual = true; hud.visible = false; hint.visible = false; camera.position.set(px, py, pz); camera.lookAt(lx, ly, lz); if (composer) { outMat.uniforms.fade.value = 1; composer.render(); } }, get dbg() { return { renderer, composer, scene, camera }; }, seek(t) { time = t; playing = false; snap = true; yaw = 0; pitch = 0; capAlpha = 0; capShown = -1; } };
tick();
