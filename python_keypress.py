import socket
import json
import keyboard
import time

s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.bind(("127.0.0.1", 8081))
while True:
    recv_value = json.loads(s.recvfrom(4096)[0].decode())
    # print(recv_value)

    if recv_value['focused']:
        print(f'[{time.time()}] focused!')
        keyboard.press('space')
        time.sleep(0.1) # hold
        keyboard.release('space')

    else:
        keyboard.release('space')