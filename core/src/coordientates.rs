use bevy::{
    color::palettes::{
        css::{BLUE, GREEN, RED},
        tailwind::GRAY_300,
    },
    prelude::*,
};

#[derive(Resource)]
pub struct AxisResource {
    pub axis: Axis,
    pub planes: Planes,
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

pub struct CoordinatesPlugin;

impl Plugin for CoordinatesPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(AxisResource {
            axis: Axis::default(),
            planes: Planes::default(),
        })
        .add_systems(Update, (draw_axis, draw_planes));
    }
}
const SCALE: f32 = 5.;

pub struct Axis {
    x: bool,
    y: bool,
    z: bool,
}

fn draw_axis(
    mut gizmo: Gizmos,
    axis: Res<AxisResource>,
    camera: Query<&mut Transform, With<Camera>>,
) {
    let Ok(transform) = camera.single() else {
        return;
    };
    let max = {
        let Vec3 { x, y, z } = transform.translation;
        x.max(y).max(z) * SCALE
    };

    let axis = &axis.into_inner().axis;
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

pub struct Planes {
    xy: bool,
    xz: bool,
    yz: bool,
}

impl Default for Planes {
    fn default() -> Self {
        Self {
            xy: false,
            xz: true,
            yz: false,
        }
    }
}

fn draw_planes(
    mut gizmo: Gizmos,
    planes: Res<AxisResource>,
    camera: Query<&mut Transform, With<Camera>>,
) {
    let Ok(transform) = camera.single() else {
        return;
    };
    let max = {
        let Vec3 { x, y, z } = transform.translation;
        x.max(y).max(z) * SCALE
    };

    let planes = &planes.into_inner().planes;

    for i in 0..(max * 2.) as usize {
        let i = i as f32 - max;
        if planes.xy {
            let start = (Vec3::ZERO).with_x(-max).with_y(i);
            let end = (Vec3::ZERO).with_x(max).with_y(i);
            gizmo.line(start, end, GRAY_300);
            let start = (Vec3::ZERO).with_y(-max).with_x(i);
            let end = (Vec3::ZERO).with_y(max).with_x(i);
            gizmo.line(start, end, GRAY_300);
        }
        if planes.xz {
            let start = (Vec3::ZERO).with_x(-max).with_z(i);
            let end = (Vec3::ZERO).with_x(max).with_z(i);
            gizmo.line(start, end, GRAY_300);
            let start = (Vec3::ZERO).with_z(-max).with_x(i);
            let end = (Vec3::ZERO).with_z(max).with_x(i);
            gizmo.line(start, end, GRAY_300);
        }
        if planes.yz {
            let start = (Vec3::ZERO).with_z(-max).with_y(i);
            let end = (Vec3::ZERO).with_z(max).with_y(i);
            gizmo.line(start, end, GRAY_300);
            let start = (Vec3::ZERO).with_y(-max).with_z(i);
            let end = (Vec3::ZERO).with_y(max).with_z(i);
            gizmo.line(start, end, GRAY_300);
        }
    }
}
