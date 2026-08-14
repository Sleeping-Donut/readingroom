use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use futures::stream::{SplitSink, StreamExt};
use futures::SinkExt;
use tokio::sync::broadcast;

use crate::AppState;

#[derive(Clone, Debug, serde::Serialize)]
pub struct WsEvent {
    pub event: String,
    pub data: serde_json::Value,
}

pub type WsBroadcaster = Arc<broadcast::Sender<WsEvent>>;

pub fn new_broadcaster() -> WsBroadcaster {
    let (tx, _) = broadcast::channel(100);
    Arc::new(tx)
}

/// Send a generic event through the broadcast channel
pub fn emit(broadcaster: &WsBroadcaster, event: &str, data: serde_json::Value) {
    let _ = broadcaster.send(WsEvent {
        event: event.to_string(),
        data,
    });
}

/// WebSocket handler — upgrades HTTP to WS, then forwards broadcast events to client
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let broadcaster = state.broadcaster.clone();
    ws.on_upgrade(move |socket| handle_socket(socket, broadcaster))
}

async fn handle_socket(socket: WebSocket, broadcaster: WsBroadcaster) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = broadcaster.subscribe();

    let send_task = tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&event) {
                if sender.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    let recv_task = tokio::spawn(async move {
        while let Some(Ok(_)) = receiver.next().await {
        }
    });

    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }
}
