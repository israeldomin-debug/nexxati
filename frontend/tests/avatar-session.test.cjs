const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const axios = require('axios');

function load(relative, dependencies, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8')
    .replace('import.meta.env.VITE_API_URL', 'undefined');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (id) => dependencies[id] || require(id), FormData, ...globals });
  return exports;
}

test('foto chega como FormData nas tentativas sucessivas; JSON continua funcionando', async () => {
  const storage = new Map([['token', 'session']]);
  const { api } = load('services/api.ts', {}, {
    localStorage: { getItem: (key) => storage.get(key), removeItem: (key) => storage.delete(key) },
    window: { location: { pathname: '/dashboard' } },
  });
  const { userService } = load('services/user.service.ts', { './api': { api } });
  let uploads = 0;
  api.defaults.adapter = async (config) => {
    assert.equal(config.headers.Authorization, 'Bearer session');
    if (config.url.endsWith('/avatar')) {
      assert.ok(config.data instanceof FormData);
      assert.equal(config.data.get('file').name, 'foto.png');
      assert.notEqual(config.headers.getContentType(), 'application/json');
      if (++uploads === 1) {
        throw new axios.AxiosError('invalid image', 'ERR_BAD_REQUEST', config, null, {
          status: 400, data: { error: 'Imagem inválida' }, config,
        });
      }
    } else {
      assert.equal(config.headers.getContentType(), 'application/json');
      assert.equal(config.data, JSON.stringify({ preset: 'EMO' }));
    }
    return { status: 200, data: { user: { id: '1' } }, headers: {}, config };
  };
  const photo = new File(['image'], 'foto.png', { type: 'image/png' });
  await assert.rejects(userService.uploadAvatar('1', photo));
  await userService.uploadAvatar('1', photo);
  await userService.selectAvatar('1', 'EMO');
  assert.equal(storage.get('token'), 'session');
});

test('falha temporária no perfil preserva sessão; token rejeitado limpa estado', async () => {
  let token = 'session';
  const user = { id: '1' };
  let failure = new Error('Network Error');
  const authService = {
    getUser: () => user,
    isAuthenticated: () => !!token,
    me: async () => { throw failure; },
    logout: () => { token = null; },
  };
  const { useAuthStore } = load('store/useAuthStore.ts', {
    '@/services/auth.service': { authService },
  }, { localStorage: { getItem: () => token } });
  for (const error of [failure, { response: { status: 500 } }, { response: { status: 429 } }]) {
    failure = error;
    await assert.rejects(useAuthStore.getState().loadUser());
    assert.equal(useAuthStore.getState().user, user);
    assert.equal(token, 'session');
    assert.equal(useAuthStore.getState().isLoading, false);
  }
  authService.me = async () => {
    token = null; // Efeito do interceptor ao receber TOKEN_EXPIRED.
    throw new Error('Token expirado');
  };
  await assert.rejects(useAuthStore.getState().loadUser());
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(useAuthStore.getState().token, null);
});
