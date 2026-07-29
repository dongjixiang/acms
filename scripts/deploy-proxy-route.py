import paramiko, sys

HOST = '47.77.238.56'
PASSWORD = 'Kuqi@1234'
USER = 'root'

try:
    transport = paramiko.Transport((HOST, 22))
    transport.connect(username=USER, password=PASSWORD)
    
    # Copy file
    sftp = paramiko.SFTPClient.from_transport(transport)
    sftp.put('C:/Users/swede/acms/server/routes/proxy-settings.js',
             '/root/acms/server/routes/proxy-settings.js')
    sftp.close()
    print('[OK] 文件已上传')
    
    # Check syntax
    chan = transport.open_session(timeout=15)
    chan.exec_command('cd /root/acms && node --check server/routes/proxy-settings.js')
    chan.settimeout(10)
    err = chan.recv_stderr(4096).decode().strip()
    out = chan.recv(4096).decode().strip()
    if err:
        print(f'语法检查: {err}', end='')
    else:
        print(f'语法检查: {out}')
    chan.close()
    
    transport.close()
    print('[DONE]')
except Exception as e:
    print(f'[FAIL] {e}')
    sys.exit(1)
