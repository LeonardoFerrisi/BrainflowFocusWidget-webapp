import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.bind(("127.0.0.1", 8081))
while True:
    print(s.recvfrom(4096)[0].decode())