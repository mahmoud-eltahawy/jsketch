use bevy::color::palettes::css::GREEN;
use bevy::prelude::*;
use crossbeam_channel::{Receiver, Sender, bounded};
use mlua::{Function, Lua};
use notify::event::{CreateKind, DataChange, ModifyKind};
use notify::{EventKind, Watcher};
use std::collections::HashMap;
use std::ops::Range;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use std::{env, fs, thread};

// ==================== Components ====================

#[derive(Component, Debug, Clone)]
struct Shape {
    id: u128,
    instant: Instant,
    draw_after: Option<Duration>,
    draw_progress: usize,
    center: Vec3,
    verts: ShapeVelocity,
}

#[derive(Debug, Clone)]
enum ShapeVelocity {
    Fixed(Vec<Vec3>),
    Moving {
        moving_verts: Vec<Vec3>,
        target: Vec<Vec3>,
    },
}

impl ShapeVelocity {
    fn origin_verts(&self) -> &Vec<Vec3> {
        match self {
            ShapeVelocity::Fixed(vs) => vs,
            ShapeVelocity::Moving { moving_verts, .. } => moving_verts,
        }
    }
}

impl Shape {
    fn new<P>(shape: P, start: Instant) -> Self
    where
        P: Points,
    {
        let instant = Instant::now();
        let id = instant.duration_since(start).as_nanos();
        Self {
            id,
            instant,
            verts: ShapeVelocity::Fixed(shape.points()),
            draw_after: None,
            draw_progress: 0,
            center: Vec3::ZERO,
        }
    }

    fn retransition(&mut self) {
        let vs = match &mut self.verts {
            ShapeVelocity::Fixed(vs) => vs,
            ShapeVelocity::Moving { moving_verts, .. } => moving_verts,
        };
        for v in vs.iter_mut() {
            *v = *v + self.center;
        }
    }
}

// ==================== Resources ====================

#[derive(Resource)]
struct ShapeCommandReceiver(Receiver<ShapeCommand>);

#[derive(Resource, Default)]
struct ShapeIdMap(HashMap<u128, Entity>);

#[derive(Resource)]
struct ProjectPath(PathBuf);

#[derive(Resource)]
struct Vm(Lua);

// Generic operation, parameterized by the ID type.
#[derive(Debug, Clone)]
enum ShapeOp<T> {
    DrawAfter { id: T, millis: u64 },
    Transition { id: T, target: Vec3 },
    ClearShape(T),
    ConvertShape { from: T, to: T },
    ClearAll,
}

// Channel command: uses u128 IDs, plus a separate Register variant.
enum ShapeCommand {
    Register(Shape),
    Op(ShapeOp<u128>), // all other operations go here
}

// Bevy event: uses Entity.
#[derive(Event, Clone, Debug)]
enum ShapeAction {
    Op(ShapeOp<Entity>), // wrap the generic op
}
// ==================== Plugin ====================

pub struct ShapesPlugin;

impl Plugin for ShapesPlugin {
    fn build(&self, app: &mut App) {
        let (tx, rx) = bounded::<ShapeCommand>(100);
        let tx = Arc::new(tx);
        let start = Instant::now();
        let engine = prepare_engine(tx.clone(), start);
        let path = program_path();

        app.init_resource::<ShapeIdMap>()
            .insert_resource(ShapeCommandReceiver(rx))
            .insert_resource(ProjectPath(path))
            .insert_resource(Vm(engine))
            .add_systems(Startup, script_system)
            .add_systems(Update, (receive_shape_commands, draw_shapes))
            .add_observer(handle_shape_actions);
    }
}

// ==================== Lua Engine Setup ====================

fn prepare_engine(sender: Arc<Sender<ShapeCommand>>, start: Instant) -> Lua {
    let lua = Lua::new();
    let globals = lua.globals();

    let sender2 = sender.clone();
    let sender3 = sender.clone();
    let sender4 = sender.clone();
    let sender5 = sender.clone();
    let sender6 = sender.clone();
    let sender7 = sender.clone();
    let sender8 = sender.clone();
    let sender9 = sender.clone();

    let sin_shape = lua
        .create_function(
            move |_, (amplitude, frequency, range_begin, range_end): (f32, f32, f32, f32)| {
                let ss = SinShape::new(amplitude, frequency, range_begin..range_end);
                let shape = Shape::new(ss, start);
                let id = shape.id;
                let ss = ShapeCommand::Register(shape);
                sender2.send(ss).unwrap();
                Ok(id)
            },
        )
        .unwrap();
    globals.set("sin_shape", sin_shape).unwrap();

    let circle_shape = lua
        .create_function(move |_, radius| {
            let ss = Circle { radius };
            let shape = Shape::new(ss, start);
            let id = shape.id;
            let ss = ShapeCommand::Register(shape);
            sender3.send(ss).unwrap();
            Ok(id)
        })
        .unwrap();
    globals.set("circle_shape", circle_shape).unwrap();

    let clear_shape = lua
        .create_function(move |_, id: u128| {
            sender4
                .send(ShapeCommand::Op(ShapeOp::ClearShape(id)))
                .unwrap();
            Ok(())
        })
        .unwrap();
    globals.set("clear_shape", clear_shape).unwrap();

    let f_shape = lua
        .create_function(move |_, (fun, begin, end): (Function, f32, f32)| {
            let shape = Shape::new(FShape::new(fun, begin, end), start);
            let id = shape.id;
            sender5.send(ShapeCommand::Register(shape)).unwrap();
            Ok(id)
        })
        .unwrap();
    globals.set("f_shape", f_shape).unwrap();

    let draw = lua
        .create_function(move |_, id: u128| {
            sender6
                .send(ShapeCommand::Op(ShapeOp::DrawAfter { id, millis: 0 }))
                .unwrap();
            Ok(())
        })
        .unwrap();
    globals.set("draw", draw).unwrap();

    let transition = lua
        .create_function(move |_, (id, x, y, z): (u128, f32, f32, f32)| {
            sender7
                .send(ShapeCommand::Op(ShapeOp::Transition {
                    id,
                    target: Vec3 { x, y, z },
                }))
                .unwrap();
            Ok(())
        })
        .unwrap();
    globals.set("transition", transition).unwrap();

    let convert_shape = lua
        .create_function(move |_, (from, to): (u128, u128)| {
            sender8
                .send(ShapeCommand::Op(ShapeOp::ConvertShape { from, to }))
                .unwrap();
            Ok(from)
        })
        .unwrap();
    globals.set("convert_shape", convert_shape).unwrap();

    let rectangle_shape = lua
        .create_function(move |_, (width, height): (f32, f32)| {
            let rect = Rectangle::new(width, height);
            let shape = Shape::new(rect, start);
            let id = shape.id;
            let ss = ShapeCommand::Register(shape);
            sender9.send(ss).unwrap();
            Ok(id)
        })
        .unwrap();
    globals.set("rectangle_shape", rectangle_shape).unwrap();

    let clear_all_shapes = lua
        .create_function(move |_, ()| {
            sender.send(ShapeCommand::Op(ShapeOp::ClearAll)).unwrap();
            Ok(())
        })
        .unwrap();
    globals.set("clear_all_shapes", clear_all_shapes).unwrap();

    lua
}

// ==================== File Watching ====================

const ENTRY_SCRIPT_NAME: &str = "init.lua";

fn script_system(vm: Res<Vm>, program_path: Res<ProjectPath>) {
    let path = program_path.0.clone();
    let path = path.canonicalize().unwrap();
    let engine = vm.0.clone();
    thread::spawn(move || {
        let is_dir = path.is_dir();
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
                if let Err(err) = engine.load(script).exec() {
                    dbg!(err);
                };
                env::set_current_dir(pwd).unwrap();
            }
        }
    });
}

fn program_path() -> PathBuf {
    let mut args = env::args();
    let project_path = args.next().expect("program must exist!!");
    match args.next().and_then(|x| x.parse::<PathBuf>().ok()) {
        Some(path) => path,
        None => {
            eprintln!("Usage: {} <script.scm>", project_path);
            std::process::exit(1);
        }
    }
}

// ==================== Bevy Systems ====================

fn receive_shape_commands(
    receiver: Res<ShapeCommandReceiver>,
    mut id_map: ResMut<ShapeIdMap>,
    mut commands: Commands,
    shapes: Query<Entity, With<Shape>>, // added to despawn synchronously
) {
    let mut count = 0;
    for cmd in receiver.0.try_iter() {
        count += 1;

        match cmd {
            ShapeCommand::Register(shape) => {
                let entity = commands.spawn(shape.clone()).id();
                id_map.0.insert(shape.id, entity);
                info!(
                    "[RECV] Registered shape id {} -> entity {:?}",
                    shape.id, entity
                );
            }
            ShapeCommand::Op(op) => match op {
                ShapeOp::ClearAll => {
                    // Despawn all shapes immediately
                    for entity in shapes.iter() {
                        commands.entity(entity).despawn();
                    }
                    id_map.0.clear();
                    info!("[RECV] Cleared all shapes synchronously");
                }
                ShapeOp::DrawAfter { id, millis } => {
                    if let Some(&entity) = id_map.0.get(&id) {
                        commands
                            .trigger(ShapeAction::Op(ShapeOp::DrawAfter { id: entity, millis }));
                    } else {
                        warn!("... not found");
                    }
                }
                ShapeOp::Transition { id, target } => {
                    if let Some(&entity) = id_map.0.get(&id) {
                        commands
                            .trigger(ShapeAction::Op(ShapeOp::Transition { id: entity, target }));
                    } else {
                        warn!("... not found");
                    }
                }
                ShapeOp::ClearShape(id) => {
                    if let Some(&entity) = id_map.0.get(&id) {
                        commands.trigger(ShapeAction::Op(ShapeOp::ClearShape(entity)));
                    } else {
                        warn!("... not found");
                    }
                }
                ShapeOp::ConvertShape { from, to } => {
                    if let (Some(&f), Some(&t)) = (id_map.0.get(&from), id_map.0.get(&to)) {
                        commands.trigger(ShapeAction::Op(ShapeOp::ConvertShape { from: f, to: t }));
                    } else {
                        warn!("... not found");
                    }
                }
            },
        }
    }
    if count > 0 {
        info!("[RECV] Processed {} commands this frame", count);
    }
}

// Observer function using On<ShapeAction>

fn handle_shape_actions(
    trigger: On<ShapeAction>,
    mut shapes: Query<(Entity, &mut Shape)>,
    mut id_map: ResMut<ShapeIdMap>,
    mut commands: Commands,
) {
    let action = trigger.event().clone();
    info!("[OBSERVER] Handling ShapeAction: {:?}", action);
    match action {
        ShapeAction::Op(op) => match op {
            ShapeOp::ClearAll => unreachable!(), // handled in receiver
            ShapeOp::DrawAfter { id: entity, millis } => {
                if let Ok((_, mut shape)) = shapes.get_mut(entity) {
                    shape.draw_after = Some(Duration::from_millis(millis));
                } else {
                    warn!("...");
                }
            }
            ShapeOp::Transition { id: entity, target } => {
                if let Ok((_, mut shape)) = shapes.get_mut(entity) {
                    shape.center += target;
                    shape.retransition();
                } else {
                    warn!("...");
                }
            }
            ShapeOp::ClearShape(entity) => {
                if shapes.get(entity).is_ok() {
                    commands.entity(entity).despawn();
                    id_map.0.retain(|_, &mut e| e != entity);
                } else {
                    warn!("...");
                }
            }
            ShapeOp::ConvertShape { from, to } => {
                let to_shape = if let Ok((_, shape)) = shapes.get(to) {
                    shape.verts.origin_verts().clone()
                } else {
                    warn!("... target not found");
                    return;
                };
                if let Ok((_, mut from_shape)) = shapes.get_mut(from) {
                    from_shape.verts = ShapeVelocity::Moving {
                        moving_verts: from_shape.verts.origin_verts().clone(),
                        target: to_shape,
                    };
                } else {
                    warn!("... source not found");
                }
            }
        },
    }
}

const SHAPE_RESOLUTION: usize = 400;
fn draw_shapes(mut gizmos: Gizmos, mut shapes: Query<&mut Shape>) {
    for mut shape in &mut shapes {
        let Shape {
            verts,
            draw_after,
            instant,
            draw_progress,
            ..
        } = &mut *shape;

        match verts {
            ShapeVelocity::Fixed(vs) => {
                let Some(df) = *draw_after else {
                    continue;
                };
                if instant.elapsed() < df {
                    continue;
                };
                if *draw_progress >= SHAPE_RESOLUTION {
                    continue;
                }
                *draw_progress += 1;
                gizmos.linestrip(vs[0..*draw_progress].to_vec(), GREEN);
            }
            ShapeVelocity::Moving {
                moving_verts,
                target,
            } => {
                for (from, to) in moving_verts.iter_mut().zip(target) {
                    *from = from.lerp(*to, 0.05);
                }
                gizmos.linestrip(moving_verts.to_vec(), GREEN);
                if *draw_progress >= SHAPE_RESOLUTION {
                    *verts = ShapeVelocity::Fixed(moving_verts.clone());
                }
            }
        }
    }
}

// ==================== Shape Definitions ====================

trait Points {
    fn point_at(&self, i: usize) -> Vec3;
    fn points(&self) -> Vec<Vec3> {
        (0..SHAPE_RESOLUTION).map(|i| self.point_at(i)).collect()
    }
}

#[derive(Debug)]
struct SinShape {
    amplitude: f32,
    frequency: f32,
    range: Range<f32>,
}

impl SinShape {
    fn new(amplitude: f32, frequency: f32, range: Range<f32>) -> Self {
        Self {
            amplitude,
            frequency,
            range,
        }
    }
}

impl Points for SinShape {
    fn point_at(&self, i: usize) -> Vec3 {
        let start = self.range.start;
        let end = self.range.end;
        let amp = self.amplitude;
        let freq = self.frequency;
        let x = start.lerp(end, i as f32 / SHAPE_RESOLUTION as f32);
        let y = amp * (x * freq).sin();
        Vec3::new(x, y, 0.0)
    }
}

#[derive(Debug)]
struct Rectangle {
    width: f32,
    height: f32,
}

impl Rectangle {
    fn new(width: f32, height: f32) -> Self {
        Self { width, height }
    }
}

impl Points for Rectangle {
    fn point_at(&self, i: usize) -> Vec3 {
        let w = self.width;
        let h = self.height;
        let half_w = w / 2.0;
        let half_h = h / 2.0;
        let top_right = Vec3 {
            x: half_w,
            y: half_h,
            z: 0.0,
        };
        let top_left = Vec3 {
            x: -half_w,
            y: half_h,
            z: 0.0,
        };
        let bottom_right = Vec3 {
            x: half_w,
            y: -half_h,
            z: 0.0,
        };
        let bottom_left = Vec3 {
            x: -half_w,
            y: -half_h,
            z: 0.0,
        };
        const SIDE_RESOLUTION: usize = SHAPE_RESOLUTION / 4;

        let t = (i % SIDE_RESOLUTION) as f32 / SIDE_RESOLUTION as f32;
        if (0..SIDE_RESOLUTION).contains(&i) {
            //bottom side
            bottom_left.lerp(bottom_right, t)
        } else if (SIDE_RESOLUTION..SIDE_RESOLUTION * 2).contains(&i) {
            //right side
            bottom_right.lerp(top_right, t)
        } else if (SIDE_RESOLUTION * 2..SIDE_RESOLUTION * 3).contains(&i) {
            //top side
            top_right.lerp(top_left, t)
        } else {
            //left side
            top_left.lerp(bottom_left, t)
        }
    }
}

impl Points for Circle {
    fn point_at(&self, i: usize) -> Vec3 {
        let radius = self.radius;
        const END: f32 = 2.0 * std::f32::consts::PI;
        let angle = 0.0.lerp(END, i as f32 / SHAPE_RESOLUTION as f32);
        let x = radius * angle.cos();
        let y = radius * angle.sin();
        Vec3::new(x, y, 0.0)
    }
}

#[derive(Debug)]
struct FShape {
    fun: Function,
    range: Range<f32>,
}

impl FShape {
    fn new(fun: Function, begin: f32, end: f32) -> Self {
        Self {
            fun,
            range: begin..end,
        }
    }
}

impl Points for FShape {
    fn point_at(&self, i: usize) -> Vec3 {
        let start = self.range.start;
        let end = self.range.end;
        let fun = self.fun.clone();
        let x = start.lerp(end, i as f32 / SHAPE_RESOLUTION as f32);
        let y = fun.call::<f32>(x).unwrap();
        Vec3::new(x, y, 0.0)
    }
}
