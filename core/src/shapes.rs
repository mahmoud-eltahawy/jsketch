use bevy::color::palettes::css::{GREEN, RED};
use bevy::prelude::*;
use crossbeam_channel::{Receiver, Sender, bounded};
use std::fs;
use std::ops::Range;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use steel::steel_vm::engine::Engine;
use steel::steel_vm::register_fn::RegisterFn;

pub struct ShapesPlugin;

impl Plugin for ShapesPlugin {
    fn build(&self, app: &mut App) {
        let (tx, rx) = bounded::<ShapeCommand>(100);
        app.init_resource::<Shapes>()
            .insert_resource(ShapeReciver(rx))
            .insert_resource(ShapeSender(Arc::new(tx)))
            .insert_resource(Start(Instant::now()))
            .add_systems(
                Update,
                (draw_shapes, re_execute_the_script, execute_shape_command),
            );
    }
}

#[derive(Resource)]
struct Start(Instant);

fn re_execute_the_script(
    keys: Res<ButtonInput<KeyCode>>,
    sender: Res<ShapeSender>,
    start: Res<Start>,
) {
    if keys.just_pressed(KeyCode::Enter) {
        let sender = sender.0.clone();
        let start = start.0.clone();
        std::thread::spawn(move || {
            execute_script(sender, start);
        });
    }
}

fn execute_script(sender: Arc<Sender<ShapeCommand>>, start: Instant) {
    let mut args = std::env::args();
    let program_name = args.next().expect("program must exist!!");
    let path = match args.next().and_then(|x| x.parse::<PathBuf>().ok()) {
        Some(path) => path,
        None => {
            eprintln!("Usage: {} <script.scm>", program_name);
            std::process::exit(1);
        }
    };

    let mut engine = Engine::new();

    let sender2 = sender.clone();
    let sender3 = sender.clone();
    let sender4 = sender.clone();
    engine.register_fn(
        "SinShape",
        move |amplitude: i64, frequency: i64, range_begin: i64, range_end: i64| {
            let ss = SinShape::new(
                amplitude as f32,
                frequency as f32,
                range_begin as f32..range_end as f32,
            );
            let shape = Shape::sin(ss, start);
            let id = shape.id;
            let ss = ShapeCommand::Draw(shape);
            sender2.send(ss).unwrap();
            return id;
        },
    );
    engine.register_fn(
        "CircleShape",
        move |radius: i64, x: i64, y: i64, z: i64, speed: i64| {
            let ss = CircleShape {
                angle: 0.0,
                radius: radius as f32,
                center: Vec3 {
                    x: x as f32,
                    y: y as f32,
                    z: z as f32,
                },
                speed: speed as f32,
            };
            let shape = Shape::circle(ss, start);
            let id = shape.id;
            let ss = ShapeCommand::Draw(shape);
            sender3.send(ss).unwrap();
            return id;
        },
    );
    engine.register_fn("ClearShape", move |id: usize| {
        sender4.send(ShapeCommand::ClearShapeWithId(id)).unwrap();
    });
    engine.register_fn("ClearShapes", move || {
        sender.send(ShapeCommand::ClearAll).unwrap();
    });

    let script = fs::read_to_string(&path).unwrap();
    println!("Executing: {}\n", path.display());

    match engine.run(script) {
        Ok(results) => {
            println!("--- Results ---");
            for (i, val) in results.iter().enumerate() {
                println!("[{i}] {val:?}");
            }
        }
        Err(e) => eprintln!("Error during execution: {}", e),
    }
}

#[derive(Resource)]
struct ShapeReciver(Receiver<ShapeCommand>);

#[derive(Resource)]
struct ShapeSender(Arc<Sender<ShapeCommand>>);

enum ShapeCommand {
    ClearAll,
    Draw(Shape),
    ClearShapeWithId(usize),
}

struct Shape {
    id: u128,
    instant: Instant,
    form: ShapeForm,
}

impl Shape {
    fn sin(s: SinShape, start: Instant) -> Self {
        let form = ShapeForm::Sin(s);
        let instant = Instant::now();
        let id = instant.duration_since(start).as_nanos();
        Self { id, instant, form }
    }

    fn circle(s: CircleShape, start: Instant) -> Self {
        let form = ShapeForm::Circle(s);
        let instant = Instant::now();
        let id = instant.duration_since(start).as_nanos();
        Self { id, instant, form }
    }
}

enum ShapeForm {
    Sin(SinShape),
    Circle(CircleShape),
}

#[derive(Resource, Default)]
struct Shapes(Vec<Shape>);

#[derive(Debug)]
struct CircleShape {
    angle: f32,
    radius: f32,
    center: Vec3,
    speed: f32,
}

impl Default for CircleShape {
    fn default() -> Self {
        Self {
            angle: 0.,
            radius: 2.,
            center: Vec3::ZERO,
            speed: 60.,
        }
    }
}

fn draw_shapes(mut gizmos: Gizmos, mut shapes: ResMut<Shapes>) {
    for shape in &mut shapes.0 {
        let gizmos: &mut Gizmos<'_, '_> = &mut gizmos;
        match &mut shape.form {
            ShapeForm::Sin(ss) => {
                let x = shape.instant.elapsed().as_secs_f32();
                let start = ss.range.start;
                let end = ss.range.end;
                let x = start + x;
                if x <= end {
                    let y = ss.amplitude * (x * ss.frequency).sin();
                    ss.verts.push(Vec3 { x, y, z: 0. });
                }
                gizmos.linestrip(ss.verts.clone(), GREEN);
            }
            ShapeForm::Circle(cs) => {
                let angle = shape.instant.elapsed().as_secs_f32() * cs.speed;
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
}

fn execute_shape_command(mut shapes: ResMut<Shapes>, reciver: Res<ShapeReciver>) {
    for shape in reciver.0.try_iter() {
        match shape {
            ShapeCommand::ClearAll => {
                shapes.0.clear();
            }
            ShapeCommand::Draw(shape) => {
                shapes.0.push(shape);
            }
            ShapeCommand::ClearShapeWithId(id) => {
                shapes.0.retain(|x| x.id != id as u128);
            }
        }
    }
}

#[derive(Debug)]
struct SinShape {
    verts: Vec<Vec3>,
    amplitude: f32,
    frequency: f32,
    range: Range<f32>,
}

impl SinShape {
    fn new(amplitude: f32, frequency: f32, range: Range<f32>) -> Self {
        Self {
            verts: Vec::new(),
            amplitude,
            frequency,
            range,
        }
    }
}

impl Default for SinShape {
    fn default() -> Self {
        Self {
            verts: Default::default(),
            amplitude: 3.,
            frequency: 3.,
            range: (-10.0..10.0),
        }
    }
}
