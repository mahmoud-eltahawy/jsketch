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
            ShapeVelocity::Moving {
                moving_verts: shape,
                ..
            } => shape,
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

// ==================== Events ====================

#[derive(Event, Copy, Clone, Debug)]
enum ShapeAction {
    ClearAll,
    DrawAfter { entity: Entity, millis: u64 },
    Transition { entity: Entity, target: Vec3 },
    ClearShape(Entity),
    ConvertShape { from: Entity, to: Entity },
}

// ==================== Channel Commands ====================

enum ShapeCommand {
    ClearAll,
    Register(Shape),
    DrawAfter { id: u128, milis: u64 },
    Transition { id: u128, target: Vec3 },
    ClearShape(u128),
    ConvertShape { from: u128, to: u128 },
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
            sender4.send(ShapeCommand::ClearShape(id)).unwrap();
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
                .send(ShapeCommand::DrawAfter { id, milis: 0 })
                .unwrap();
            Ok(())
        })
        .unwrap();
    globals.set("draw", draw).unwrap();

    let transition = lua
        .create_function(move |_, (id, x, y, z): (u128, f32, f32, f32)| {
            sender7
                .send(ShapeCommand::Transition {
                    id,
                    target: Vec3 { x, y, z },
                })
                .unwrap();
            Ok(())
        })
        .unwrap();
    globals.set("transition", transition).unwrap();

    let convert_shape = lua
        .create_function(move |_, (from, to): (u128, u128)| {
            sender8
                .send(ShapeCommand::ConvertShape { from, to })
                .unwrap();
            Ok(from)
        })
        .unwrap();
    globals.set("convert_shape", convert_shape).unwrap();

    let clear_all_shapes = lua
        .create_function(move |_, ()| {
            sender.send(ShapeCommand::ClearAll).unwrap();
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
            ShapeCommand::ClearAll => {
                // Despawn all existing shapes immediately
                for entity in shapes.iter() {
                    commands.entity(entity).despawn();
                }
                id_map.0.clear();
                info!("[RECV] Cleared all shapes synchronously");
            }
            ShapeCommand::DrawAfter { id, milis } => {
                if let Some(&entity) = id_map.0.get(&id) {
                    info!(
                        "[RECV] Triggering DrawAfter for id {} (entity {:?}) with millis {}",
                        id, entity, milis
                    );
                    commands.trigger(ShapeAction::DrawAfter {
                        entity,
                        millis: milis,
                    });
                } else {
                    warn!("[RECV] DrawAfter: shape id {} not found", id);
                }
            }
            ShapeCommand::Transition { id, target } => {
                if let Some(&entity) = id_map.0.get(&id) {
                    info!(
                        "[RECV] Triggering Transition for id {} (entity {:?}) with target {:?}",
                        id, entity, target
                    );
                    commands.trigger(ShapeAction::Transition { entity, target });
                } else {
                    warn!("[RECV] Transition: shape id {} not found", id);
                }
            }
            ShapeCommand::ClearShape(id) => {
                if let Some(&entity) = id_map.0.get(&id) {
                    info!(
                        "[RECV] Triggering ClearShape for id {} (entity {:?})",
                        id, entity
                    );
                    commands.trigger(ShapeAction::ClearShape(entity));
                } else {
                    warn!("[RECV] ClearShape: shape id {} not found", id);
                }
            }
            ShapeCommand::ConvertShape { from, to } => {
                let from_entity = id_map.0.get(&from).copied();
                let to_entity = id_map.0.get(&to).copied();
                if let (Some(from_entity), Some(to_entity)) = (from_entity, to_entity) {
                    info!(
                        "[RECV] Triggering ConvertShape from id {} (entity {:?}) to id {} (entity {:?})",
                        from, from_entity, to, to_entity
                    );
                    commands.trigger(ShapeAction::ConvertShape {
                        from: from_entity,
                        to: to_entity,
                    });
                } else {
                    warn!(
                        "[RECV] ConvertShape: from id {} or to id {} not found",
                        from, to
                    );
                }
            }
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
    let action = *trigger.event();
    info!("[OBSERVER] Handling ShapeAction: {:?}", action);
    match action {
        ShapeAction::ClearAll => {
            let entities: Vec<Entity> = shapes.iter().map(|(e, _)| e).collect();
            for entity in entities {
                commands.entity(entity).despawn();
                info!("[OBSERVER] Despawned entity {:?} due to ClearAll", entity);
            }
            id_map.0.clear();
            info!("[OBSERVER] Cleared id_map");
        }
        ShapeAction::DrawAfter { entity, millis } => {
            if let Ok((_, mut shape)) = shapes.get_mut(entity) {
                shape.draw_after = Some(Duration::from_millis(millis));
                info!(
                    "[OBSERVER] Set draw_after for entity {:?} to {}ms",
                    entity, millis
                );
            } else {
                warn!(
                    "[OBSERVER] DrawAfter: entity {:?} not found or not a Shape",
                    entity
                );
            }
        }
        ShapeAction::Transition { entity, target } => {
            if let Ok((_, mut shape)) = shapes.get_mut(entity) {
                shape.center += target;
                shape.retransition();
                info!(
                    "[OBSERVER] Applied transition to entity {:?} with target {:?}",
                    entity, target
                );
            } else {
                warn!(
                    "[OBSERVER] Transition: entity {:?} not found or not a Shape",
                    entity
                );
            }
        }
        ShapeAction::ClearShape(entity) => {
            if shapes.get(entity).is_ok() {
                commands.entity(entity).despawn();
                id_map.0.retain(|_, &mut e| e != entity);
                info!("[OBSERVER] Despawned entity {:?} due to ClearShape", entity);
            } else {
                warn!("[OBSERVER] ClearShape: entity {:?} not found", entity);
            }
        }
        ShapeAction::ConvertShape { from, to } => {
            let to_shape = if let Ok((_, shape)) = shapes.get(to) {
                shape.verts.origin_verts().clone()
            } else {
                warn!(
                    "[OBSERVER] ConvertShape: target entity {:?} not found or not a Shape",
                    to
                );
                return;
            };
            if let Ok((_, mut from_shape)) = shapes.get_mut(from) {
                from_shape.verts = ShapeVelocity::Moving {
                    moving_verts: from_shape.verts.origin_verts().clone(),
                    target: to_shape,
                };
                info!(
                    "[OBSERVER] Converted shape from entity {:?} to target shape",
                    from
                );
            } else {
                warn!(
                    "[OBSERVER] ConvertShape: source entity {:?} not found or not a Shape",
                    from
                );
            }
        }
    }
}

fn draw_shapes(mut gizmos: Gizmos, mut shapes: Query<&mut Shape>) {
    const SHAPE_RESOLUTION: usize = 400;

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
    fn point_closure(&self) -> Box<dyn Fn(usize) -> Vec3>;
    fn points(&self) -> Vec<Vec3> {
        (0..400).map(self.point_closure()).collect()
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
    fn point_closure(&self) -> Box<dyn Fn(usize) -> Vec3> {
        let start = self.range.start;
        let end = self.range.end;
        let amp = self.amplitude;
        let freq = self.frequency;
        Box::new(move |i| {
            let x = start.lerp(end, i as f32 / 400.0);
            let y = amp * (x * freq).sin();
            Vec3::new(x, y, 0.0)
        })
    }
}

#[derive(Debug)]
struct Circle {
    radius: f32,
}

impl Points for Circle {
    fn point_closure(&self) -> Box<dyn Fn(usize) -> Vec3> {
        let radius = self.radius;
        const END: f32 = 2.0 * std::f32::consts::PI;
        Box::new(move |i| {
            let angle = 0.0.lerp(END, i as f32 / 400.0);
            let x = radius * angle.cos();
            let y = radius * angle.sin();
            Vec3::new(x, y, 0.0)
        })
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
    fn point_closure(&self) -> Box<dyn Fn(usize) -> Vec3> {
        let start = self.range.start;
        let end = self.range.end;
        let fun = self.fun.clone();
        Box::new(move |i| {
            let x = start.lerp(end, i as f32 / 400.0);
            let y = fun.call::<f32>(x).unwrap();
            Vec3::new(x, y, 0.0)
        })
    }
}
