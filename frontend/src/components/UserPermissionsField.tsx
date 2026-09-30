import { UserPermission } from '../types';
import { permissionGroups } from '../utils/permissions';

interface Props {
  value: UserPermission[];
  disabled?: boolean;
  onChange: (permissions: UserPermission[]) => void;
}

export function UserPermissionsField({ value, disabled, onChange }: Props) {
  const toggle = (permission: UserPermission) => {
    if (value.includes(permission)) {
      onChange(value.filter((item) => item !== permission));
      return;
    }
    onChange([...value, permission]);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-900">Permissões individuais</h3>
        <p className="mt-1 text-xs text-slate-500">
          Use estas opções para liberar menus ou funções específicas sem mudar o perfil principal.
        </p>
      </div>

      <div className="space-y-5">
        {permissionGroups.map((group) => (
          <section key={group.title}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{group.title}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.permissions.map((permission) => (
                <label
                  key={permission.value}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm hover:border-blue-200"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(permission.value)}
                    disabled={disabled}
                    onChange={() => toggle(permission.value)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block font-semibold text-slate-800">{permission.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">{permission.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
