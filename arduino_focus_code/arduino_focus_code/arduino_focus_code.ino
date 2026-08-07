// Define the pin connected to the relay module
const int RELAY_PIN = 8;

// Most single-channel relay modules (with an onboard optocoupler) are
// "active LOW": driving the signal pin LOW energizes the relay coil.
// If your relay behaves backwards, flip this to false.
const bool RELAY_ACTIVE_LOW = true;

void setup() {
  // Must match the backend's SerialPort baudRate (server/index.ts)
  Serial.begin(115200);

  // Configure the relay pin as an output
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_BUILTIN, OUTPUT);

  // Ensure the relay starts in the OFF state
  relayOff();
}

void loop() {
  // Check if data is available to read from the serial port
  if (Serial.available() > 0) {
    // Read the incoming byte
    char incomingByte = Serial.read();

    // Turn relay ON if '1' is received
    if (incomingByte == '1') {
      relayOn();
    }
    // Turn relay OFF if '0' is received
    else if (incomingByte == '0') {
      relayOff();
    }
  }
}

void relayOn() {
  // digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? LOW : HIGH);
  digitalWrite(RELAY_PIN, HIGH);
  digitalWrite(LED_BUILTIN, HIGH);
}

void relayOff() {
  // digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? HIGH : LOW);
  digitalWrite(RELAY_PIN, LOW);
  digitalWrite(LED_BUILTIN, LOW);
}