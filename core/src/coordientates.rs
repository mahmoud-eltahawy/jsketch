use bevy::{
    color::palettes::{
        css::{BLUE, GREEN, RED},
        tailwind::GRAY_300,
    },
    prelude::*,
};

#[derive(Resource)]
pub struct DebugGridConfig {
    pub axes: AxesConfig,
    pub planes: PlanesConfig,
    pub scale: f32,
    pub grid_lines_per_side: i32,
    pub min_axis_length: f32,
}

impl Default for DebugGridConfig {
    fn default() -> Self {
        Self {
            axes: default(),
            planes: default(),
            scale: 10.0,
            grid_lines_per_side: 20,
            min_axis_length: 5.0,
        }
    }
}

pub struct AxesConfig {
    pub x: bool,
    pub y: bool,
    pub z: bool,
}

impl Default for AxesConfig {
    fn default() -> Self {
        Self {
            x: true,
            y: true,
            z: true,
        }
    }
}

pub struct PlanesConfig {
    pub xy: bool,
    pub xz: bool,
    pub yz: bool,
}

impl Default for PlanesConfig {
    fn default() -> Self {
        Self {
            xz: true,
            xy: Default::default(),
            yz: Default::default(),
        }
    }
}

pub struct CoordinatesPlugin;

impl Plugin for CoordinatesPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<DebugGridConfig>()
            .add_systems(Update, (draw_planes, draw_axis));
    }
}

fn draw_axis(
    mut gizmo: Gizmos,
    config: Res<DebugGridConfig>,
    camera: Query<&Transform, With<Camera>>,
) {
    let Ok(transform) = camera.single() else {
        return;
    };

    let length =
        (transform.translation.abs().max_element() * config.scale).max(config.min_axis_length);

    let axes = &config.axes;

    if axes.x {
        let x = Vec3::X * length;
        gizmo.line(-x, x, RED);
    }
    if axes.y {
        let y = Vec3::Y * length;
        gizmo.line(-y, y, GREEN);
    }
    if axes.z {
        let z = Vec3::Z * length;
        gizmo.line(-z, z, BLUE);
    }
}

fn draw_planes(
    mut gizmo: Gizmos,
    config: Res<DebugGridConfig>,
    camera: Query<&Transform, With<Camera>>,
) {
    let Ok(transform) = camera.single() else {
        return;
    };

    let max_dist =
        (transform.translation.abs().max_element() * config.scale).max(config.min_axis_length);

    let step = (max_dist / config.grid_lines_per_side as f32).max(0.5);
    // Number of steps on each side of zero
    let steps_per_side = (max_dist / step).round() as i32;

    let planes = &config.planes;

    for i in -steps_per_side..=steps_per_side {
        let pos = i as f32 * step;

        if planes.xy {
            gizmo.line(
                Vec3::new(-max_dist, pos, 0.0),
                Vec3::new(max_dist, pos, 0.0),
                GRAY_300,
            );
            gizmo.line(
                Vec3::new(pos, -max_dist, 0.0),
                Vec3::new(pos, max_dist, 0.0),
                GRAY_300,
            );
        }
        if planes.xz {
            gizmo.line(
                Vec3::new(-max_dist, 0.0, pos),
                Vec3::new(max_dist, 0.0, pos),
                GRAY_300,
            );
            gizmo.line(
                Vec3::new(pos, 0.0, -max_dist),
                Vec3::new(pos, 0.0, max_dist),
                GRAY_300,
            );
        }
        if planes.yz {
            gizmo.line(
                Vec3::new(0.0, -max_dist, pos),
                Vec3::new(0.0, max_dist, pos),
                GRAY_300,
            );
            gizmo.line(
                Vec3::new(0.0, pos, -max_dist),
                Vec3::new(0.0, pos, max_dist),
                GRAY_300,
            );
        }
    }
}
