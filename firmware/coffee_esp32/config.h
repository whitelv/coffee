#pragma once

// WiFi credentials
#define WIFI_SSID     "your-wifi-ssid"
#define WIFI_PASS     "your-wifi-password"

// WebSocket server
#define SERVER_URL    "ws://your-app.onrender.com/ws/esp/ESP32_BAR_01"
#define ESP_ID        "ESP32_BAR_01"

// HX711 pins
#define HX711_DOUT  4
#define HX711_SCK   2

// MFRC522 pins
#define MFRC522_SS  5
#define MFRC522_RST 16
// SPI bus uses ESP32 hardware defaults: SCK=18, MISO=19, MOSI=23

// HX711 calibration factor (run calibrate_hx711 sketch to determine)
#define CALIBRATION_F  420.0f

// Timing (ms)
#define WS_RECONNECT_DELAY_MS  3000
#define HEARTBEAT_INTERVAL_MS  30000
#define WEIGHT_SEND_INTERVAL_MS  50
