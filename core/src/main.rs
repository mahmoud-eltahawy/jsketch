use bevy::{
    camera_controller::free_camera::{FreeCamera, FreeCameraPlugin},
    prelude::*,
};
use coordientates::CoordinatesPlugin;

use crate::shapes::{Shapes, animate_new_shapes, animate_shapes, prepare_channels};

mod coordientates;
mod shapes;

fn main() -> AppExit {
    App::new()
        .init_resource::<Shapes>()
        .add_plugins((DefaultPlugins, FreeCameraPlugin, CoordinatesPlugin))
        .add_systems(Startup, (setup_camera, prepare_channels))
        .add_systems(Update, animate_shapes)
        .add_systems(Update, animate_new_shapes)
        .run()
}

fn setup_camera(mut commands: Commands) {
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(1., 1., 8.).looking_at(Vec3::ZERO, Vec3::Y),
        FreeCamera::default(),
    ));
}
