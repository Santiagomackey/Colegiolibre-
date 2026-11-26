(() => {
  const form = document.querySelector('#help-form');
  const field = document.querySelector('#help-question');
  const status = document.querySelector('#help-status');
  const log = document.querySelector('#help-log');
  const scroll = document.querySelector('#chat-scroll');
  const welcome = document.querySelector('#chat-welcome');
  const button = form.querySelector('button');
  let history = [];

  function show(role, text, source) {
    const message = document.createElement('div');
    message.className = 'chat-message ' + role;
    const label = document.createElement('strong');
    label.textContent = role === 'user' ? 'Vos' : source === 'guide' ? 'Guía de ColeGo' : 'ColeGo IA';
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    message.append(label, paragraph);
    log.append(message);
    scroll.scrollTop = scroll.scrollHeight;
    return message;
  }

  function resize() {
    field.style.height = 'auto';
    field.style.height = Math.min(field.scrollHeight, 96) + 'px';
  }

  field.addEventListener('input', resize);
  field.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!button.disabled) form.requestSubmit();
    }
  });
  welcome.querySelectorAll('button').forEach(starter => {
    starter.addEventListener('click', () => {
      field.value = starter.textContent;
      form.requestSubmit();
    });
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = field.value.trim();
    if (!question || button.disabled) return;
    button.disabled = field.readOnly = true;
    welcome.hidden = true;
    const bubble = show('user', question);
    field.value = '';
    resize();
    status.textContent = 'Preparando respuesta…';
    const messages = [...history.slice(-6), {role:'user', content:question}];
    try {
      const response = await fetch('/api/help-assistant', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messages}), signal:AbortSignal.timeout(26000)
      });
      const data = await response.json();
      if (!response.ok || typeof data.answer !== 'string' || !data.answer.trim()) {
        throw new Error(response.status === 429 ? 'limit' : 'unavailable');
      }
      show('assistant', data.answer, data.source);
      history = [...messages, {role:'assistant', content:data.answer}];
      status.textContent = '';
    } catch (error) {
      bubble.remove();
      field.value = question;
      resize();
      status.textContent = error.message === 'limit' ? 'Alcanzaste el límite de consultas por hora. Volvé más tarde.' : 'El mensaje quedó en el campo de texto. Tocá enviar para reintentar.';
    } finally {
      button.disabled = field.readOnly = false;
    }
  });
})();
