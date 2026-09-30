import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { BrandMark } from '../components/BrandMark';

export function ChangePassword() {
  const navigate = useNavigate();
  const { user, changePassword, logout, isLoading, error } = useAuthStore();
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [localError, setLocalError] = useState('');

  const update = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError('');

    if (form.newPassword !== form.confirmPassword) {
      setLocalError('A confirmação não confere com a nova senha.');
      return;
    }

    if (form.newPassword.length < 6) {
      setLocalError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    try {
      await changePassword(form);
      navigate('/dashboard', { replace: true });
    } catch {
      // erro já vem do store
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6">
          <BrandMark centered fullLogo />
        </div>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <LockKeyhole size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-950">Troque sua senha</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Olá, {user?.name || 'usuário'}. Por segurança, defina sua própria senha antes de continuar.
          </p>
        </div>

        {(localError || error) && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {localError || error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Senha atual
            <input
              type="password"
              name="currentPassword"
              value={form.currentPassword}
              onChange={update}
              required
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Nova senha
            <input
              type="password"
              name="newPassword"
              value={form.newPassword}
              onChange={update}
              minLength={6}
              required
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Confirmar nova senha
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={update}
              minLength={6}
              required
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {isLoading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
          className="mt-4 w-full text-sm font-semibold text-slate-500 hover:text-slate-800"
        >
          Sair e trocar depois
        </button>
      </div>
    </div>
  );
}
