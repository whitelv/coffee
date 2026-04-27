/*
 * HX711 Calibration Sketch
 *
 * Instructions:
 *   1. Upload this sketch to your ESP32.
 *   2. Open Serial Monitor at 115200 baud.
 *   3. Remove all weight from the scale, send 'c' to tare.
 *   4. Place a known weight on the scale.
 *   5. Enter the known weight in grams in the serial monitor.
 *   6. The calibration factor is printed — copy it to config.h as CALIBRATION_F.
 *
 * Requires: HX711 Arduino Library by Bogdan Necula
 */

#include <HX711.h>

#define HX711_DOUT 4
#define HX711_SCK  2

HX711 scale;

float calibrationFactor = 1.0f;
float knownWeight = 0.0f;

void setup() {
  Serial.begin(115200);
  delay(500);
  scale.begin(HX711_DOUT, HX711_SCK);
  scale.set_scale();
  scale.tare();
  Serial.println("HX711 Calibration");
  Serial.println("------------------");
  Serial.println("Remove all weight from the scale and send 'c' to tare.");
}

void loop() {
  if (Serial.available()) {
    char cmd = Serial.read();
    while (Serial.available()) Serial.read(); // flush

    if (cmd == 'c') {
      scale.tare();
      Serial.println("Scale tared. Now place your known weight and enter its mass in grams:");
    } else if (cmd >= '0' && cmd <= '9') {
      // shouldn't happen — handled below via parseInt
    }

    // Re-read for numeric input
    if (cmd != 'c') {
      // re-push char back is not possible; just inform user
      Serial.println("Send 'c' to tare, or type a number followed by Enter for known weight in grams.");
    }
  }

  // Read numeric input for known weight
  if (Serial.available() > 1) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.length() > 0 && isDigit(input[0])) {
      knownWeight = input.toFloat();
      long rawReading = scale.read_average(20);
      if (knownWeight > 0) {
        calibrationFactor = rawReading / knownWeight;
        scale.set_scale(calibrationFactor);
        Serial.printf("Known weight: %.1f g\n", knownWeight);
        Serial.printf("Raw reading:  %ld\n", rawReading);
        Serial.printf(">>> CALIBRATION_F = %.2f <<<\n", calibrationFactor);
        Serial.println("Copy this value into firmware/coffee_esp32/config.h");
      }
    }
  }

  // Print live reading every second
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint > 1000) {
    lastPrint = millis();
    if (scale.is_ready()) {
      Serial.printf("Live reading: %.2f g  (raw: %ld)\n", scale.get_units(5), scale.read());
    }
  }
}
