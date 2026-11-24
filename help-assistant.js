(() => {
  const form = document.querySelector('#help-form');
  const field = document.querySelector('#help-question');
  const status = document.querySelector('#help-status');
  const log = document.querySelector('#help-log');
  const button = form.querySelector('button');
  let history = [];
  function show(role,text) {
    const label = document.createElement('strong');
    label.textContent = role === 'user' ? 'Vos' : 'ColeGo IA';
    const p = document.createElement('p');
    p.textContent = text;
    log.append(label,p);
    log.scrollTop = log.scrollHeight;
  }
  form.addEventListener('submit',async event => {
    event.preventDefault();
    const question = field.value.trim();
    if (!question || button.disabled) return;
    button.disabled = field.readOnly = true;
    status.textContent = 'Buscando una respuesta…';
    const messages = [...history.slice(-6),{role:'user',content:question}];
    try {
      const response = await fetch('/api/help-assistant',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messages}),signal:AbortSignal.timeout(26000)});
      const data = await response.json();
      if (!response.ok || !data.answer) {
        status.textContent = data.error || 'Volvé a intentar o escribí a soporte.';
        return;
      }
      show('user',question);
      show('assistant',data.answer);
      history = [...messages,{role:'assistant',content:data.answer}];
      field.value = '';
      status.textContent = '';
    } catch { status.textContent = 'No pudimos conectar con el asistente. Volvé a intentar o escribí a soporte.'; }
    finally { button.disabled = field.readOnly = false; }
  });
})();
