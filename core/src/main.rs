use bevy::{
    camera_controller::free_camera::{FreeCamera, FreeCameraPlugin},
    color::palettes::css::RED,
    prelude::*,
};
mod coordientates;

fn main() -> AppExit {
    App::new()
        .add_plugins((
            DefaultPlugins,
            FreeCameraPlugin,
            coordientates::CoordinatesPlugin,
        ))
        .add_systems(Startup, start)
        .add_systems(Update, animate_circle)
        .run()
}

fn start(mut commands: Commands) {
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(1., 1., 8.).looking_at(Vec3::ZERO, Vec3::Y),
        FreeCamera::default(),
    ));
}

fn animate_circle(mut gizmos: Gizmos, time: Res<Time>) {
    // Animate radius over time
    let mut angle = time.elapsed_secs() * 30.;

    if angle > 360. {
        angle = 360.;
    };
    // Draw a green circle at the center
    // gizmos.circle_2d(Vec2::ZERO, radius, Color::srgb(0.0, 1.0, 0.0));
    gizmos
        .arc_3d(
            angle.to_radians(),
            1.0,
            Isometry3d::from_rotation(Quat::from_rotation_x(90.)),
            RED,
        )
        .resolution(1000);
}
