# Agente remoto IDL Ativos e Chamados

## Instalação recomendada

1. Mantenha `IDL-Ativos-Agent.exe`, `agent.config.json` e os arquivos de instalação na mesma pasta.
2. Execute `INSTALAR-AGENTE-ELEVADO.bat`.
3. Autorize a janela do Windows uma única vez.

O instalador copia o agente para `C:\ProgramData\IDL Ativos e Chamados\RemoteAgent`, remove a marca de arquivo baixado e registra tarefas executadas como `SYSTEM` durante a inicialização do computador.

Depois da instalação, o agente inicia silenciosamente e não pede confirmação a cada login. Nenhuma senha administrativa fica armazenada.

## Atualização pela rede

- A versão 1.7.1 habilita a atualização automática dentro da rede interna ou VPN e reforça a inicialização automática.
- Esta versão precisa ser instalada manualmente uma única vez nas máquinas que ainda usam versões anteriores.
- Depois disso, o agente verifica atualizações no servidor a cada 15 minutos, baixa o novo executável e valida seu SHA-256 antes de instalar.
- A substituição é feita como `SYSTEM`, sem confirmação do usuário. A versão anterior fica em `IDL-Ativos-Agent.exe.previous` para restauração automática em caso de falha.
- Ao executar este instalador sobre uma instalação existente, o `agent.config.json` já configurado na máquina é preservado.
- O andamento e eventuais falhas aparecem nas telas **Saúde** e **Gestão > Agentes**.

## Funcionamento e diagnóstico

- O agente envia um sinal de atividade a cada 1 minuto.
- O inventário completo de hardware e programas é atualizado a cada 15 minutos para reduzir o uso de recursos.
- Os registros ficam em `C:\ProgramData\IDL Ativos e Chamados\RemoteAgent\agent.log` e são rotacionados automaticamente.
- Um watchdog executado pelo Agendador de Tarefas verifica a cada 5 minutos se o agente continua ativo e reinicia o processo quando necessário.
- Para verificar tarefa, processo, configuração, conexão e últimas mensagens, execute `DIAGNOSTICAR-AGENTE-ELEVADO.bat`.
- Uma segunda execução do agente é ignorada automaticamente para evitar processos duplicados.

## Remoção

Execute `REMOVER-AGENTE-ELEVADO.bat` e autorize a remoção.
