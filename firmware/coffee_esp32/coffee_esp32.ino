/*
 * Coffee Bar ESP32 Firmware — placeholder
 * Full implementation will replace this in Prompt 4.
 *
 * Libraries required (install via Arduino Library Manager):
 *   - ArduinoWebsockets by Gil Maimon
 *   - ArduinoJson by Benoit Blanchon
 *   - MFRC522 by GithubCommunity
 *   - HX711 Arduino Library by Bogdan Necula
 */

#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>
#include <HX711.h>

#include "config.h"

using namespace websockets;

// ---- State machine ----
enum State {
  CONNECTING_WIFI,
  CONNECTING_WS,
  IDLE,
  AUTHENTICATED,
  WEIGHING
};

State state = CONNECTING_WIFI;

// ---- Hardware objects ----
MFRC522 mfrc522(MFRC522_SS, MFRC522_RST);
HX711   scale;
WebsocketsClient client;

// ---- Timers ----
unsigned long lastHeartbeat   = 0;
unsigned long lastWeightSend  = 0;
unsigned long lastReconnect   = 0;

// ---- Helpers ----
String getCardUID() {
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

void sendEvent(const char* event, const String& extraJson = "") {
  String msg = "{\"event\":\"";
  msg += event;
  msg += "\",\"esp_id\":\"";
  msg += ESP_ID;
  msg += "\"";
  if (extraJson.length() > 0) {
    msg += ",";
    msg += extraJson;
  }
  msg += "}";
  client.send(msg);
}

// ---- WebSocket message handler ----
void onMessage(WebsocketsMessage msg) {
  JsonDocument doc;
  if (deserializeJson(doc, msg.data()) != DeserializationError::Ok) return;

  const char* event = doc["event"];
  if (!event) return;

  if (strcmp(event, "auth_ok") == 0) {
    Serial.println("[WS] auth_ok — authenticated");
    state = AUTHENTICATED;
  }
  else if (strcmp(event, "auth_fail") == 0) {
    Serial.println("[WS] auth_fail");
    state = IDLE;
  }
  else if (strcmp(event, "request_weight") == 0) {
    Serial.println("[WS] request_weight — start weighing");
    state = WEIGHING;
  }
  else if (strcmp(event, "stop_weight") == 0) {
    Serial.println("[WS] stop_weight");
    state = AUTHENTICATED;
  }
  else if (strcmp(event, "tare_scale") == 0) {
    scale.tare();
    Serial.println("[WS] scale tared");
  }
  else if (strcmp(event, "session_complete") == 0) {
    Serial.println("[WS] session_complete — back to IDLE");
    state = IDLE;
  }
  else if (strcmp(event, "session_abandoned") == 0) {
    Serial.println("[WS] session_abandoned — back to IDLE");
    state = IDLE;
  }
}

// ---- WiFi connection ----
void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
}

// ---- WebSocket connection ----
bool connectWS() {
  client.onMessage(onMessage);
  client.onEvent([](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionClosed) {
      Serial.println("[WS] Disconnected");
      state = CONNECTING_WS;
    }
  });
  bool ok = client.connect(SERVER_URL);
  if (ok) {
    Serial.println("[WS] Connected");
    state = IDLE;
  } else {
    Serial.println("[WS] Connection failed");
  }
  return ok;
}

// ---- Setup ----
void setup() {
  Serial.begin(115200);
  delay(500);

  SPI.begin();
  mfrc522.PCD_Init();
  Serial.println("[RFID] MFRC522 initialized");

  scale.begin(HX711_DOUT, HX711_SCK);
  scale.set_scale(CALIBRATION_F);
  scale.tare();
  Serial.println("[HX711] Scale initialized and tared");

  connectWiFi();
  state = CONNECTING_WS;
}

// ---- Loop ----
void loop() {
  unsigned long now = millis();

  // WebSocket poll — must be called every loop
  if (state != CONNECTING_WIFI && state != CONNECTING_WS) {
    client.poll();
  }

  switch (state) {
    case CONNECTING_WIFI:
      connectWiFi();
      state = CONNECTING_WS;
      break;

    case CONNECTING_WS:
      if (now - lastReconnect >= WS_RECONNECT_DELAY_MS) {
        lastReconnect = now;
        connectWS();
      }
      break;

    case IDLE:
      // Listen for RFID scans
      if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
        String uid = getCardUID();
        Serial.printf("[RFID] Card scanned: %s\n", uid.c_str());
        String payload = "\"uid\":\"" + uid + "\"";
        sendEvent("rfid_scan", payload);
        mfrc522.PICC_HaltA();
        mfrc522.PCD_StopCrypto1();
      }
      break;

    case AUTHENTICATED:
      // Send heartbeat periodically
      if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeat = now;
        sendEvent("heartbeat", "\"state\":\"idle\"");
      }
      break;

    case WEIGHING:
      if (now - lastWeightSend >= WEIGHT_SEND_INTERVAL_MS) {
        lastWeightSend = now;
        float w = scale.get_units(3);
        String payload = "\"value\":" + String(w, 1) + ",\"unit\":\"g\"";
        sendEvent("weight_reading", payload);
      }
      // Heartbeat while weighing too
      if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeat = now;
        sendEvent("heartbeat", "\"state\":\"weighing\"");
      }
      break;
  }
}
