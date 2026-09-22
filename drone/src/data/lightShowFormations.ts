import { ShowFormation, Vector3D, ColorRGBW } from '../types/lightShowTypes';

export const SHOW_FORMATIONS: ShowFormation[] = [
  {
    id: 'SPHERICAL_CELESTIAL',
    name: 'Celestial Orb',
    description: 'Uniform Fibonacci 3D geodesic sphere with dynamic breathing pulse.',
    durationSeconds: 20,
    paletteName: 'Cyan & Deep Sapphire',
    generatePoints: (count: number) => {
      const points: { pos: Vector3D; color: ColorRGBW }[] = [];
      const radius = 28;
      const centerY = 65; // Altitude in meters
      const goldenRatio = (1 + Math.sqrt(5)) / 2;

      for (let i = 0; i < count; i++) {
        const theta = 2 * Math.PI * i / goldenRatio;
        const phi = Math.acos(1 - 2 * (i + 0.5) / count);
        
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = centerY + radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);

        // Gradient from cyan at top to deep sapphire at bottom
        const factor = (y - (centerY - radius)) / (2 * radius);
        const r = Math.round(10 + factor * 20);
        const g = Math.round(140 + factor * 115);
        const b = Math.round(230 + factor * 25);
        const w = Math.round(factor * 60);

        points.push({ pos: { x, y, z }, color: { r, g, b, w } });
      }
      return points;
    }
  },
  {
    id: 'RINGED_SATURN',
    name: 'Ringed Planet Saturn',
    description: 'Central planetary sphere encircled by a tilted dual-tier orbital dust ring.',
    durationSeconds: 25,
    paletteName: 'Solar Gold & Amber',
    generatePoints: (count: number) => {
      const points: { pos: Vector3D; color: ColorRGBW }[] = [];
      const centerY = 70;
      const sphereCount = Math.floor(count * 0.45);
      const ringCount = count - sphereCount;
      const sphereRadius = 16;
      const ringInner = 24;
      const ringOuter = 38;
      const tiltRad = (27 * Math.PI) / 180; // 27 degree planetary axial tilt

      // Planet Sphere
      const goldenRatio = (1 + Math.sqrt(5)) / 2;
      for (let i = 0; i < sphereCount; i++) {
        const theta = 2 * Math.PI * i / goldenRatio;
        const phi = Math.acos(1 - 2 * (i + 0.5) / sphereCount);
        const x = sphereRadius * Math.sin(phi) * Math.cos(theta);
        const y = centerY + sphereRadius * Math.cos(phi);
        const z = sphereRadius * Math.sin(phi) * Math.sin(theta);
        points.push({ 
          pos: { x, y, z }, 
          color: { r: 245, g: 180, b: 60, w: 90 } // Amber glow
        });
      }

      // Planetary Ring
      for (let i = 0; i < ringCount; i++) {
        const t = (i / ringCount) * 2 * Math.PI;
        const rad = ringInner + (i % 2) * (ringOuter - ringInner);
        const rawX = rad * Math.cos(t);
        const rawY = 0;
        const rawZ = rad * Math.sin(t);

        // Apply tilt rotation around X-axis
        const x = rawX;
        const y = centerY + rawY * Math.cos(tiltRad) - rawZ * Math.sin(tiltRad);
        const z = rawY * Math.sin(tiltRad) + rawZ * Math.cos(tiltRad);

        points.push({ 
          pos: { x, y, z }, 
          color: { r: 255, g: 220, b: 120, w: 140 } // Brilliant gold ring
        });
      }
      return points;
    }
  },
  {
    id: 'SPIRAL_GALAXY',
    name: 'Spiral Galaxy',
    description: 'Logarithmic 3-arm swirling galaxy disc with dense core and trailing arms.',
    durationSeconds: 22,
    paletteName: 'Cosmic Violet & Magenta',
    generatePoints: (count: number) => {
      const points: { pos: Vector3D; color: ColorRGBW }[] = [];
      const centerY = 68;
      const arms = 3;

      for (let i = 0; i < count; i++) {
        const armIndex = i % arms;
        const distRatio = Math.sqrt((i + 1) / count); // higher density near center
        const radius = 3 + distRatio * 35;
        const spiralAngle = (distRatio * 3.5 * Math.PI) + (armIndex * (2 * Math.PI / arms));
        
        // Slight vertical thickness bell-curve
        const heightJitter = (Math.random() - 0.5) * (1 - distRatio) * 12;

        const x = radius * Math.cos(spiralAngle);
        const y = centerY + heightJitter;
        const z = radius * Math.sin(spiralAngle);

        // Core is bright white, outer arms are rich magenta/violet
        const r = Math.round(180 + (1 - distRatio) * 75);
        const g = Math.round(50 + (1 - distRatio) * 180);
        const b = Math.round(230 + (1 - distRatio) * 25);
        const w = Math.round((1 - distRatio) * 200);

        points.push({ pos: { x, y, z }, color: { r, g, b, w } });
      }
      return points;
    }
  },
  {
    id: 'FLYING_BIRD',
    name: 'Avian Wing Sweep',
    description: 'Volumetric bird silhouette with curved dihedral wings and directional fuselage.',
    durationSeconds: 24,
    paletteName: 'Emerald Aurora & Azure',
    generatePoints: (count: number) => {
      const points: { pos: Vector3D; color: ColorRGBW }[] = [];
      const centerY = 65;

      for (let i = 0; i < count; i++) {
        // Parametric wing span (-36 to +36)
        const u = ((i / (count - 1)) * 2 - 1) * 34; // wing span position
        const wingAbs = Math.abs(u);
        
        // Dihedral wing flap curve
        const wingY = centerY + Math.sin(wingAbs * 0.08) * 14 - (wingAbs * 0.15);
        const sweepZ = -Math.pow(wingAbs * 0.18, 1.4) * 4;
        
        // Body depth
        const x = u;
        const y = wingY;
        const z = sweepZ + ((i % 3) - 1) * 2.5;

        // Wingtips emerald, center fuselage royal azure
        const tipFactor = wingAbs / 34;
        const r = Math.round(10 + tipFactor * 40);
        const g = Math.round(120 + tipFactor * 135);
        const b = Math.round(240 - tipFactor * 120);
        const w = Math.round(tipFactor * 80);

        points.push({ pos: { x, y, z }, color: { r, g, b, w } });
      }
      return points;
    }
  },
  {
    id: 'DOUBLE_HELIX',
    name: 'Double Helix DNA',
    description: 'Intertwined biomolecular double helix with horizontal base pair rungs.',
    durationSeconds: 22,
    paletteName: 'Ruby Coral & Turquoise',
    generatePoints: (count: number) => {
      const points: { pos: Vector3D; color: ColorRGBW }[] = [];
      const baseAlt = 35;
      const height = 65;
      const radius = 16;
      const turns = 2.5;

      for (let i = 0; i < count; i++) {
        const t = i / count;
        const currentY = baseAlt + t * height;
        const angle = t * turns * 2 * Math.PI;

        if (i % 3 === 0) {
          // Strand A
          const x = radius * Math.cos(angle);
          const z = radius * Math.sin(angle);
          points.push({ pos: { x, y: currentY, z }, color: { r: 255, g: 60, b: 90, w: 40 } }); // Ruby
        } else if (i % 3 === 1) {
          // Strand B (offset 180 degrees)
          const x = radius * Math.cos(angle + Math.PI);
          const z = radius * Math.sin(angle + Math.PI);
          points.push({ pos: { x, y: currentY, z }, color: { r: 40, g: 230, b: 210, w: 40 } }); // Turquoise
        } else {
          // Base-pair bridge connecting strands
          const fractionAcross = ((i % 5) / 4) - 0.5; // -0.5 to 0.5
          const x = radius * Math.cos(angle) * fractionAcross * 1.6;
          const z = radius * Math.sin(angle) * fractionAcross * 1.6;
          points.push({ pos: { x, y: currentY, z }, color: { r: 255, g: 255, b: 255, w: 200 } }); // Bright White
        }
      }
      return points;
    }
  },
  {
    id: 'MERIDIAN_LOGO',
    name: 'Meridian Star & Typography',
    description: 'Prismatic 8-point nautical star insignia framed by high-contrast geometric rings.',
    durationSeconds: 25,
    paletteName: 'Prismatic Diamond & Royal Blue',
    generatePoints: (count: number) => {
      const points: { pos: Vector3D; color: ColorRGBW }[] = [];
      const centerY = 68;
      const numPoints = 8;
      const starCount = Math.floor(count * 0.7);
      const ringCount = count - starCount;

      // 8-Pointed Star
      for (let i = 0; i < starCount; i++) {
        const theta = (i / starCount) * 2 * Math.PI;
        // Modulate radius between inner and outer star vertices
        const rMod = (Math.sin(theta * numPoints / 2) > 0) ? 32 : 14;
        const x = rMod * Math.cos(theta);
        const y = centerY + (Math.sin(theta * 2) * 4);
        const z = rMod * Math.sin(theta);
        points.push({ pos: { x, y, z }, color: { r: 255, g: 255, b: 255, w: 255 } });
      }

      // Outer Halo Ring
      for (let i = 0; i < ringCount; i++) {
        const theta = (i / ringCount) * 2 * Math.PI;
        const x = 36 * Math.cos(theta);
        const y = centerY;
        const z = 36 * Math.sin(theta);
        points.push({ pos: { x, y, z }, color: { r: 40, g: 130, b: 255, w: 50 } });
      }

      return points;
    }
  }
];
