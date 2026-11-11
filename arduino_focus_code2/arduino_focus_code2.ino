// OpenBCI serial output to Arduino for Focus / Relaxation Activity
// For Union Neurotech Introduction to Brain Computer Interfaces Workshop

const byte numChars = 32;
char receivedChars[numChars];   // an array to store the received data
String val = "";
String previousData = "";
boolean newData = false;

int RELAY_PIN = 8;
int LED_INDICATOR_PIN = 13;

void setup() {
    Serial.begin(57600);
    pinMode(LED_BUILTIN, OUTPUT);
    pinMode(RELAY_PIN, OUTPUT);
    pinMode(LED_INDICATOR_PIN, OUTPUT);
    digitalWrite(LED_INDICATOR_PIN, LOW);
    Serial.println("<Arduino is ready>");
}

void loop() {
  // For communicating with OpenBCI
    recvWithEndMarker();
    showNewData();

  // For communciating over serial command using "1" and "0" as a manner of debugging functionality
    // demoInput();
    // showNewDataDemo();
}

void demoInput() {
  while (Serial.available() > 0 && newData == false) {
    val = "";
    val = Serial.read();
    Serial.println("Recieved: " + val);
    newData = true;
  }
}

void showNewDataDemo() {
    // Serial.println("No new data detected...");

    if (newData == true) {
        Serial.println("New data detected...");
        //Convert char array into string
        String s = val;
        //Only perform an action when the incoming data changes
        if (!s.equals(previousData)) {
          //Check if the string is "true" or "false"
          if (s.equals("48")) {
            Serial.println("Input: FALSE");
            digitalWrite(LED_BUILTIN, LOW);
            digitalWrite(RELAY_PIN, LOW);
            digitalWrite(LED_INDICATOR_PIN, LOW);
          } else if (s.equals("49")) {
            Serial.println("Input: TRUE");
            digitalWrite(LED_BUILTIN, HIGH);
            digitalWrite(RELAY_PIN, HIGH);
            digitalWrite(LED_INDICATOR_PIN, HIGH);
          } else {
            //Otherwise print the incoming with no action
            Serial.println("This just in ... " + s);
          }
        }
        newData = false;
        previousData = s;
    }
}


//Recieve data and look for the endMarker '\n' (new line)
void recvWithEndMarker() {
    static byte ndx = 0;
    char endMarker = '\n';
    char rc;
    
    while (Serial.available() > 0 && newData == false) {
        rc = Serial.read();
        // Serial.println("Recievd character");
        // Serial.println(rc);
        if (rc != endMarker) {
            receivedChars[ndx] = rc;
            ndx++;
            if (ndx >= numChars) {
                ndx = numChars - 1;
            }
        }
        else {
            receivedChars[ndx] = '\0'; // terminate the string
            ndx = 0;
            newData = true;
        }
    }
}

void showNewData() {
    // Serial.println("No new data detected...");

    if (newData == true) {
        Serial.println("New data detected...");
        //Convert char array into string
        String s = receivedChars;
        //Only perform an action when the incoming data changes
        if (!s.equals(previousData)) {
          //Check if the string is "true" or "false"
          if (s.equals("0")) {
            Serial.println("Input: FALSE");
            digitalWrite(LED_BUILTIN, LOW);
            digitalWrite(RELAY_PIN, LOW);
            digitalWrite(LED_INDICATOR_PIN, LOW);
          } else if (s.equals("1")) {
            Serial.println("Input: TRUE");
            digitalWrite(LED_BUILTIN, HIGH);
            digitalWrite(RELAY_PIN, HIGH);
            digitalWrite(LED_INDICATOR_PIN, HIGH);
          } else {
            //Otherwise print the incoming with no action
            Serial.println("This just in ... " + s);
          }
        }
        newData = false;
        previousData = s;
    }
}
