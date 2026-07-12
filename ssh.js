// ACMS 内建工具 — Agent SSH 远程执行工具
// 让 agent 能通过 SSH 连接到远程服务器执行命令（需要配置 SSH 密钥）
const { registerTool } = require('../../services/tool-registry');

registerTool({
  name: 'agent_ssh_execute',
  description: 'Execute a command on a remote server via SSH. Requires SSH key configured in ~/.ssh/. Supported hosts: 120 (120.24.204.130), local (localhost). Use for remote debugging, log checking, and server-side operations.',
  parameters: {
    type: 'object',
    properties: {
      host: { type: 'string', enum: ['120', 'local', 'custom'], description: 'Target host. "120" for production server, "local" for localhost, "custom" for arbitrary host.', default: 'local' },
      command: { type: 'string', description: 'Shell command to execute on the remote server.' },
      customHost: { type: 'string', description: 'When host=custom, provide the full host string (user@host:port).' },
      port: { type: 'integer', description: 'SSH port (default: 22).', default: 22 },
      timeout: { type: 'integer', description: 'Command timeout in milliseconds (default: 30000).', default: 30000 },
    },
    required: ['host', 'command'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');

    let sshHost, sshPort, sshCmd;

    if (args.host === '120') {
      sshHost = 'root@120.24.204.130';
      sshPort = 22;
    } else if (args.host === 'local') {
      sshHost = 'localhost';
      sshPort = 22;
    } else {
      sshHost = args.customHost || args.host;
      sshPort = args.port || 22;
    }

    // 构建 SSH 命令
    const cmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${sshPort} ${sshHost} "${args.command.replace(/"/g, '\\"')}"`;

    const result = await workspace.exec(slug, {
      cmd,
      timeout: args.timeout || 30000,
    });

    return {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: (result.stdout || '').slice(0, 10000),
      stderr: (result.stderr || '').slice(0, 5000),
    };
  },
});

registerTool({
  name: 'agent_ssh_check',
  description: 'Check SSH connectivity to a configured host. Returns connection status and server info.',
  parameters: {
    type: 'object',
    properties: {
      host: { type: 'string', enum: ['120', 'local', 'custom'], description: 'Host to check.', default: 'local' },
      customHost: { type: 'string', description: 'Full host string when host=custom.' },
    },
    required: ['host'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');

    let sshHost, sshPort;
    if (args.host === '120') {
      sshHost = 'root@120.24.204.130';
      sshPort = 22;
    } else if (args.host === 'local') {
      sshHost = 'localhost';
      sshPort = 22;
    } else {
      sshHost = args.customHost || args.host;
      sshPort = 22;
    }

    const cmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -p ${sshPort} ${sshHost} "echo connected; hostname; uname -a; uptime"`;

    const result = await workspace.exec(slug, {
      cmd,
      timeout: 10000,
    });

    return {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      output: (result.stdout || '').slice(0, 2000),
      error: (result.stderr || '').slice(0, 1000),
    };
  },
});

console.log('[tools] SSH 工具注册完成: agent_ssh_execute, agent_ssh_check');
