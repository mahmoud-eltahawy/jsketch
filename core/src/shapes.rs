use bevy::color::palettes::css::{GREEN, RED};
use bevy::prelude::*;
use crossbeam_channel::{Receiver, Sender, bounded};
use notify::event::{CreateKind, DataChange, ModifyKind};
use notify::{EventKind, Watcher};
use std::ops::Range;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use std::{env, fs, thread};
use steel::steel_vm::engine::Engine;
use steel::steel_vm::register_fn::RegisterFn;

pub struct ShapesPlugin;

impl Plugin for ShapesPlugin {
    fn build(&self, app: &mut App) {
        let (t_shape_x, r_shape_x) = bounded::<ShapeCommand>(100);
        let path = program_path();
        app.init_resource::<Shapes>()
            .insert_resource(ShapeReciver(r_shape_x))
            .insert_resource(ShapeSender(Arc::new(t_shape_x)))
            .insert_resource(Start(Instant::now()))
            .insert_resource(ProjectPath(path))
            .add_systems(
                Update,
                (
                    script_system.run_if(run_once),
                    draw_shapes,
                    execute_shape_command,
                ),
            );
    }
}

const ENTRY_SCRIPT_NAME: &str = "main.scm";

fn script_system(sender: Res<ShapeSender>, start: Res<Start>, program_path: Res<ProjectPath>) {
    let sender = sender.0.clone();
    let start = start.0.clone();
    let path = program_path.0.clone();
    let path = path.canonicalize().unwrap();
    thread::spawn(move || {
        let is_dir = path.is_dir();
        let mut engine = prepare_engine(sender.clone(), start);
        let (tx, rx) = bounded::<notify::Result<notify::Event>>(1);

        let mut project_watcher =
            notify::recommended_watcher(tx).expect("can not watch file changes");

        let watch_path = if is_dir {
            path.clone()
        } else {
            path.parent().unwrap().to_path_buf()
        };

        project_watcher
            .watch(&watch_path, notify::RecursiveMode::NonRecursive)
            .unwrap();

        for event in rx.iter() {
            let Ok(event) = event else {
                continue;
            };
            if let EventKind::Modify(ModifyKind::Data(DataChange::Any))
            | EventKind::Create(CreateKind::File) = event.kind
            {
                if !watch_path.exists() {
                    eprintln!(
                        "Error : project source directory path {watch_path:#?} does not exist"
                    );
                    return;
                }
                let pwd = env::current_dir().unwrap();
                env::set_current_dir(&watch_path).unwrap();
                let entry_script = if is_dir {
                    watch_path.join(ENTRY_SCRIPT_NAME)
                } else {
                    path.clone()
                };
                let script = fs::read_to_string(&entry_script).unwrap();
                println!("Executing: {}\n", entry_script.display());
                if let Err(err) = engine.run(script) {
                    dbg!(err);
                };
                env::set_current_dir(pwd).unwrap();
            }
        }
    });
}

#[derive(Resource)]
struct Start(Instant);

#[derive(Resource)]
struct ProjectPath(PathBuf);

fn prepare_engine(sender: Arc<Sender<ShapeCommand>>, start: Instant) -> Engine {
    let mut engine = Engine::new();

    let sender2 = sender.clone();
    let sender3 = sender.clone();
    let sender4 = sender.clone();
    let sender5 = sender.clone();
    engine.register_fn(
        "sin-shape",
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
        "circle-shape",
        move |radius: i64, x: i64, y: i64, z: i64, speed: i64| {
            let ss = CircleShape {
                angle: 0.0,
                radius: radius as f32,
                center: Vec3 {
                    x: x as f32,
                    y: y as f32,
                    z: z as f32,
                },
                speed: (speed as f32 % 100.0) / 100.0,
            };
            let shape = Shape::circle(ss, start);
            let id = shape.id;
            let ss = ShapeCommand::Draw(shape);
            sender3.send(ss).unwrap();
            return id;
        },
    );
    engine.register_fn("clear-shape", move |id: usize| {
        sender4.send(ShapeCommand::ClearShapeWithId(id)).unwrap();
    });
    engine.register_fn("f-shape", move |verts: Vec<f32>| {
        let shape = Shape::f(FShape::new(verts), start);
        let id = shape.id;
        sender5.send(ShapeCommand::Draw(shape)).unwrap();
        id
    });
    engine.register_fn("clear-all-shapes", move || {
        sender.send(ShapeCommand::ClearAll).unwrap();
    });
    engine
}

fn program_path() -> PathBuf {
    let mut args = env::args();
    let project_path = args.next().expect("program must exist!!");
    let path = match args.next().and_then(|x| x.parse::<PathBuf>().ok()) {
        Some(path) => path,
        None => {
            eprintln!("Usage: {} <script.scm>", project_path);
            std::process::exit(1);
        }
    };
    path
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

#[derive(Debug)]
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

    fn f(form: FShape, start: Instant) -> Shape {
        let form = ShapeForm::FShape(form);
        let instant = Instant::now();
        let id = instant.duration_since(start).as_nanos();
        Self { id, instant, form }
    }
}

#[derive(Debug)]
enum ShapeForm {
    Sin(SinShape),
    Circle(CircleShape),
    FShape(FShape),
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
        match &mut shape.form {
            ShapeForm::Sin(ss) => {
                ss.x = ss.x.lerp(ss.range.end, 0.01);
                let y = ss.amplitude * (ss.x * ss.frequency).sin();
                ss.verts.push(Vec3 { x: ss.x, y, z: 0.0 });
                gizmos.linestrip(ss.verts.clone(), GREEN);
            }
            ShapeForm::Circle(cs) => {
                cs.angle = cs.angle.lerp(360.0, cs.speed);

                gizmos
                    .arc_3d(
                        cs.angle.to_radians(),
                        cs.radius,
                        Isometry3d::new(cs.center, Quat::from_rotation_x(90.)),
                        RED,
                    )
                    .resolution(1000);
            }
            ShapeForm::FShape(fshape) => {
                fshape.index = (fshape.index as f32)
                    .lerp(fshape.verts.len() as f32, 0.05)
                    .ceil() as usize;
                let end = fshape.index;
                let verts = fshape.verts[0..end].to_vec();
                gizmos.linestrip(verts, GREEN);
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
    x: f32,
}

#[derive(Debug)]
struct FShape {
    verts: Vec<Vec3>,
    index: usize,
}
impl FShape {
    fn new(verts: Vec<f32>) -> Self {
        Self {
            verts: verts
                .windows(2)
                .step_by(2)
                .map(|w| Vec3 {
                    x: w[0],
                    y: w[1],
                    z: 0.,
                })
                .collect(),
            index: 0,
        }
    }
}

impl SinShape {
    fn new(amplitude: f32, frequency: f32, range: Range<f32>) -> Self {
        Self {
            verts: Vec::new(),
            amplitude,
            frequency,
            x: range.start,
            range,
        }
    }
}

impl Default for SinShape {
    fn default() -> Self {
        let start = -10.0;
        Self {
            verts: Default::default(),
            amplitude: 3.,
            frequency: 3.,
            x: start,
            range: (start..10.0),
        }
    }
}
