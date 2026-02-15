use bevy::{
    color::palettes::{
        css::{BLUE, GREEN, RED},
        tailwind::GRAY_300,
    },
    prelude::*,
};

/// Settings for drawing the coordinate axes.
#[derive(Resource, Default)]
pub struct AxisResource {
    pub axis: Axis,
    pub planes: Planes,
}

pub struct Axis {
    pub x: bool,
    pub y: bool,
    pub z: bool,
}

impl Default for Axis {
    fn default() -> Self {
        Self {
            x: true,
            y: true,
            z: true,
        }
    }
}

/// Which grid planes to draw.
pub struct Planes {
    pub xy: bool,
    pub xz: bool,
    pub yz: bool,
}

impl Default for Planes {
    fn default() -> Self {
        Self {
            xz: true,
            xy: false,
            yz: false,
        }
    }
}

pub struct CoordinatesPlugin;

impl Plugin for CoordinatesPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<AxisResource>()
            .add_systems(Update, (draw_axis, draw_planes));
    }
}

const SCALE: f32 = 10.;

fn draw_axis(
    mut gizmo: Gizmos,
    settings: Res<AxisResource>,
    camera: Query<&Transform, With<Camera>>,
) {
    let Ok(transform) = camera.single() else {
        return;
    };

    let max = transform.translation.abs().max_element() * SCALE;

    let axis = &settings.axis;
    if axis.x {
        let x = Vec3::X * max;
        gizmo.line(-x, x, RED);
    }
    if axis.y {
        let y = Vec3::Y * max;
        gizmo.line(-y, y, GREEN);
    }
    if axis.z {
        let z = Vec3::Z * max;
        gizmo.line(-z, z, BLUE);
    }
}

fn draw_planes(
    mut gizmo: Gizmos,
    settings: Res<AxisResource>,
    camera: Query<&Transform, With<Camera>>,
) {
    let Ok(transform) = camera.single() else {
        return;
    };

    let max = transform.translation.abs().max_element() * SCALE;

    let planes = &settings.planes;
    let range = -(max.floor() as i32)..=(max.floor() as i32);

    for i in range {
        let i = i as f32;

        if planes.xy {
            // Lines parallel to X at fixed Y
            let start = Vec3::new(-max, i, 0.0);
            let end = Vec3::new(max, i, 0.0);
            gizmo.line(start, end, GRAY_300);
            // Lines parallel to Y at fixed X
            let start = Vec3::new(i, -max, 0.0);
            let end = Vec3::new(i, max, 0.0);
            gizmo.line(start, end, GRAY_300);
        }

        if planes.xz {
            // Lines parallel to X at fixed Z
            let start = Vec3::new(-max, 0.0, i);
            let end = Vec3::new(max, 0.0, i);
            gizmo.line(start, end, GRAY_300);
            // Lines parallel to Z at fixed X
            let start = Vec3::new(i, 0.0, -max);
            let end = Vec3::new(i, 0.0, max);
            gizmo.line(start, end, GRAY_300);
        }

        if planes.yz {
            // Lines parallel to Y at fixed Z
            let start = Vec3::new(0.0, -max, i);
            let end = Vec3::new(0.0, max, i);
            gizmo.line(start, end, GRAY_300);
            // Lines parallel to Z at fixed Y
            let start = Vec3::new(0.0, i, -max);
            let end = Vec3::new(0.0, i, max);
            gizmo.line(start, end, GRAY_300);
        }
    }
}
