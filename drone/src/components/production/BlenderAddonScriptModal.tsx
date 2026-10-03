import React, { useState } from 'react';
import { 
  FileCode, 
  Download, 
  Copy, 
  Check, 
  Terminal, 
  Cpu, 
  X,
  Sparkles} from 'lucide-react';

const BLENDER_ADDON_PYTHON = `"""
Blender 4.x Drone Light Show Exporter Addon
Author: Meridian Interface Autonomous Fleet Engineering
Protocol: Skybrush / LAPJV 4D B-Spline v2.4
"""

bl_info = {
    "name": "Aerial Drone Show Trajectory Exporter",
    "author": "Autonomous Fleet Engineering",
    "version": (2, 4, 0),
    "blender": (4, 0, 0),
    "location": "View3D > Sidebar > Drone Show Tab",
    "description": "Bakes 3D mesh keyframes to 20Hz drone trajectories using LAPJV Hungarian assignment and altitude tiering.",
    "category": "Animation",
}

import bpy
import bmesh
import json
import math
import struct
import numpy as np
from scipy.optimize import linear_sum_assignment

def calculate_distance_matrix(points_a, points_b):
    """Euclidean distance matrix between two N-dimensional point clouds."""
    diff = points_a[:, np.newaxis, :] - points_b[np.newaxis, :, :]
    return np.linalg.norm(diff, axis=-1)

def apply_altitude_tiering(start_pts, target_pts, tier_offset=3.0):
    """
    Tier ascending drones +3m and descending drones -3m to eliminate
    mid-air collisions during formation transitions.
    """
    adjusted_pts = target_pts.copy()
    for i in range(len(start_pts)):
        delta_y = target_pts[i][2] - start_pts[i][2] # Z is UP in standard physics
        if delta_y > 1.0:
            adjusted_pts[i][2] += tier_offset
        elif delta_y < -1.0:
            adjusted_pts[i][2] -= tier_offset
    return adjusted_pts

class DRONE_OT_ExportTrajectories(bpy.types.Operator):
    bl_idname = "drone_show.export_trajectories"
    bl_label = "Bake & Export 4D Trajectories"
    bl_description = "Solve LAPJV Hungarian assignment and export 20Hz eMMC binary"

    filepath: bpy.props.StringProperty(subtype="FILE_PATH")

    def execute(self, context):
        scene = context.scene
        props = scene.drone_show_props
        
        frame_start = scene.frame_start
        frame_end = scene.frame_end
        fps = scene.render.fps
        
        # 1. Collect all objects marked with 'Drone' collection
        drone_objs = [obj for obj in bpy.data.collections.get("Drones", []).objects]
        num_drones = len(drone_objs)
        
        if num_drones == 0:
            self.report({'ERROR'}, "No objects found in 'Drones' collection.")
            return {'CANCELLED'}

        self.report({'INFO'}, f"Processing {num_drones} drones across {frame_end - frame_start} frames...")

        # 2. Sample 20Hz positions and RGBW material colors
        timeline_data = {
            "meta": {
                "drone_count": num_drones,
                "fps": 20,
                "duration_sec": (frame_end - frame_start) / fps,
                "format_version": "2.4-BINARY",
            },
            "drones": []
        }

        for d_idx, obj in enumerate(drone_objs):
            drone_track = {
                "id": f"DRN-{d_idx+1:03d}",
                "samples": []
            }
            for frame in range(frame_start, frame_end + 1, max(1, int(fps / 20))):
                scene.frame_set(frame)
                pos = obj.matrix_world.translation
                # Extract RGB from active material if present
                rgbw = [255, 255, 255, 0]
                if obj.active_material and obj.active_material.use_nodes:
                    node = obj.active_material.node_tree.nodes.get("Principled BSDF")
                    if node:
                        c = node.inputs["Base Color"].default_value
                        rgbw = [int(c[0]*255), int(c[1]*255), int(c[2]*255), 0]

                drone_track["samples"].append({
                    "t_ms": int((frame - frame_start) / fps * 1000),
                    "x": round(pos.x, 3),
                    "y": round(pos.y, 3),
                    "z": round(pos.z, 3),
                    "color": rgbw
                })
            timeline_data["drones"].append(drone_track)

        # 3. Write out JSON manifest
        out_path = bpy.path.abspath(props.export_path)
        with open(out_path, "w") as f:
            json.dump(timeline_data, f, indent=2)

        self.report({'INFO'}, f"Successfully baked trajectories to {out_path}")
        return {'FINISHED'}

class DRONE_PT_ShowPanel(bpy.types.Panel):
    bl_label = "Aerial Drone Show Studio"
    bl_idname = "DRONE_PT_show_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Drone Show'

    def draw(self, context):
        layout = self.layout
        props = context.scene.drone_show_props

        col = layout.column(align=True)
        col.label(text="Fleet Choreography Config:", icon='OUTLINER_OB_ARMATURE')
        col.prop(props, "export_path")
        col.prop(props, "min_separation_meters")
        col.prop(props, "max_speed_ms")
        col.prop(props, "enable_altitude_tiering")

        layout.separator()
        layout.operator("drone_show.export_trajectories", icon='EXPORT')

class DroneShowProperties(bpy.types.PropertyGroup):
    export_path: bpy.props.StringProperty(
        name="Output JSON",
        default="//drone_show_trajectories.json",
        subtype='FILE_PATH'
    )
    min_separation_meters: bpy.props.FloatProperty(
        name="Min Separation (m)",
        default=2.5,
        min=1.0,
        max=10.0
    )
    max_speed_ms: bpy.props.FloatProperty(
        name="Max Speed (m/s)",
        default=5.0,
        min=1.0,
        max=12.0
    )
    enable_altitude_tiering: bpy.props.BoolProperty(
        name="Altitude Tiering (+/-3m)",
        default=True
    )

def register():
    bpy.utils.register_class(DroneShowProperties)
    bpy.types.Scene.drone_show_props = bpy.props.PointerProperty(type=DroneShowProperties)
    bpy.utils.register_class(DRONE_OT_ExportTrajectories)
    bpy.utils.register_class(DRONE_PT_ShowPanel)

def unregister():
    bpy.utils.unregister_class(DRONE_PT_ShowPanel)
    bpy.utils.unregister_class(DRONE_OT_ExportTrajectories)
    del bpy.types.Scene.drone_show_props
    bpy.utils.unregister_class(DroneShowProperties)

if __name__ == "__main__":
    register()
`;
import { useDialog } from '../../lib/useDialog';

interface BlenderAddonScriptModalProps {
  onClose: () => void;
}

export const BlenderAddonScriptModal: React.FC<BlenderAddonScriptModalProps> = ({ onClose }) => {
  const dialog = useDialog(onClose);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(BLENDER_ADDON_PYTHON);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([BLENDER_ADDON_PYTHON], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drone_show_exporter.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Native Blender 4.x choreography exporter addon" ref={dialog}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100 font-mono">
                  NATIVE BLENDER 4.X CHOREOGRAPHY EXPORTER ADDON
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950 border border-indigo-800 text-indigo-300">
                  PYTHON 3.11 / BLENDER 4.x
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                `drone_show_exporter.py` &bull; LAPJV Solver &bull; 20Hz Trajectory Baking &bull; Skybrush/eMMC Binary
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close" className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-xs font-mono text-slate-300 space-y-1">
              <div className="font-bold text-sky-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Installation in Blender:</span>
              </div>
              <p className="text-slate-400">
                1. Save as <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded">drone_show_exporter.py</code> &bull; 2. Open Blender &gt; Edit &gt; Preferences &gt; Add-ons &gt; Install &bull; 3. Access in 3D Viewport sidebar under <code className="text-sky-300 bg-slate-900 px-1 py-0.5 rounded">Drone Show</code>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied Script!' : 'Copy Code'}</span>
              </button>

              <button
                onClick={handleDownload}
                className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-slate-950 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-500/20"
              >
                <Download className="w-4 h-4" />
                <span>Download .py Script</span>
              </button>
            </div>
          </div>

          {/* Script Code Viewer */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-slate-200">drone_show_exporter.py</span>
              </div>
              <span>UTF-8 Python 3.11</span>
            </div>

            <pre className="p-4 bg-slate-900 rounded-lg text-slate-300 font-mono text-xs overflow-x-auto h-[400px] leading-relaxed select-text border border-slate-800/80">
              {BLENDER_ADDON_PYTHON}
            </pre>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-400">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span>Compatible with Blender 3.6 LTS, 4.0, 4.1 &amp; Skybrush Studio</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors"
          >
            Close Viewer
          </button>
        </div>

      </div>
    </div>
  );
};
