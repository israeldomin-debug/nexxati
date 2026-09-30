export function requestDeletePassword(itemDescription: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4';
    const form = document.createElement('form');
    form.className = 'w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl';
    const title = document.createElement('h2');
    title.className = 'text-lg font-bold text-slate-900';
    title.textContent = 'Confirmar exclusão';
    const description = document.createElement('p');
    description.className = 'mt-2 text-sm text-slate-600';
    description.textContent = itemDescription;
    const input = document.createElement('input');
    input.type = 'password';
    input.autocomplete = 'current-password';
    input.required = true;
    input.placeholder = 'Digite sua senha';
    input.className = 'mt-5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100';
    const actions = document.createElement('div');
    actions.className = 'mt-5 flex justify-end gap-3';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancelar';
    cancel.className = 'rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700';
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.textContent = 'Excluir';
    confirm.className = 'rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white';
    actions.append(cancel, confirm);
    form.append(title, description, input, actions);
    overlay.append(form);
    document.body.append(overlay);

    const finish = (value: string | null) => { overlay.remove(); resolve(value); };
    cancel.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(null); });
    form.addEventListener('submit', (event) => { event.preventDefault(); finish(input.value.trim() || null); });
    input.focus();
  });
}
