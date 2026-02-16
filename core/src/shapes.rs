use bevy::color::palettes::css::{GREEN, RED};
use bevy::prelude::*;
use crossbeam_channel::{Receiver, bounded};
use std::ops::Range;
use std::thread::{self, sleep};
use std::time::{Duration, Instant};

pub fn prepare_channels(mut commands: Commands) {
    let (tx, rx) = bounded::<Shape>(1);
    thread::spawn(move || {
        let mut i = 3.0;
        loop {
            sleep(Duration::from_secs(5));
            tx.send(Shape::Circle(CircleShape {
                radius: i,
                ..CircleShape::default()
            }))
            .unwrap();
            i += 3.
        }
    });
    commands.insert_resource(ShapeReciver(rx));
}

#[derive(Resource)]
pub struct ShapeReciver(Receiver<Shape>);

pub enum Shape {
    Sin(SinShape),
    Circle(CircleShape),
}

#[derive(Resource)]
pub(crate) struct Shapes(Vec<Shape>);

impl Default for Shapes {
    fn default() -> Self {
        Self(vec![
            Shape::Circle(CircleShape::default()),
            Shape::Sin(SinShape::default()),
        ])
    }
}

pub(crate) struct CircleShape {
    pub(crate) begin: Instant,
    pub(crate) angle: f32,
    pub(crate) radius: f32,
    pub(crate) center: Vec3,
    pub(crate) speed: f32,
}

impl Default for CircleShape {
    fn default() -> Self {
        Self {
            begin: Instant::now(),
            angle: 0.,
            radius: 2.,
            center: Vec3::ZERO,
            speed: 60.,
        }
    }
}

pub(crate) fn animate_shapes(mut gizmos: Gizmos, mut shapes: ResMut<Shapes>) {
    for shape in &mut shapes.0 {
        handle_shape(&mut gizmos, shape);
    }
}

pub(crate) fn animate_new_shapes(
    mut gizmos: Gizmos,
    mut shapes: ResMut<Shapes>,
    reciver: Res<ShapeReciver>,
) {
    for shape in reciver.0.try_iter() {
        shapes.0.push(shape);
        let mut shape = shapes.0.last_mut().unwrap();
        handle_shape(&mut gizmos, &mut shape);
    }
}

pub(crate) fn handle_shape(gizmos: &mut Gizmos<'_, '_>, shape: &mut Shape) {
    match shape {
        Shape::Sin(ss) => {
            let x = ss.begin.elapsed().as_secs_f32();
            let start = ss.range.start;
            let end = ss.range.end;
            let x = start + x;
            if x <= end {
                let y = ss.amplitude * (x * ss.frequency).sin();
                ss.verts.push(Vec3 { x, y, z: 0. });
            }
            gizmos.linestrip(ss.verts.clone(), GREEN);
        }
        Shape::Circle(cs) => {
            let angle = cs.begin.elapsed().as_secs_f32() * cs.speed;
            if angle <= 363. {
                cs.angle = angle;
            }

            gizmos
                .arc_3d(
                    cs.angle.to_radians(),
                    cs.radius,
                    Isometry3d::new(cs.center, Quat::from_rotation_x(90.)),
                    RED,
                )
                .resolution(1000);
        }
    }
}

pub(crate) struct SinShape {
    pub(crate) begin: Instant,
    pub(crate) verts: Vec<Vec3>,
    pub(crate) amplitude: f32,
    pub(crate) frequency: f32,
    pub(crate) range: Range<f32>,
}

impl Default for SinShape {
    fn default() -> Self {
        Self {
            begin: Instant::now(),
            verts: Default::default(),
            amplitude: 3.,
            frequency: 3.,
            range: (-10.0..10.0),
        }
    }
}
