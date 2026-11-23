(() => {
  const form=document.querySelector('#wanted-form');
  if(!form)return;
  const preview=document.querySelector('#wanted-preview');
  const t=(es,en)=>document.documentElement.dataset.language==='en'?en:es;
  function updatePreview(){
    const data=new FormData(form), title=String(data.get('title')||'').trim();
    const scope={school:t('Mi colegio','My school'),zone:t('Mi zona','My area'),country:t('Toda Argentina','Nationwide')}[data.get('scope')];
    preview.querySelector('strong').textContent=title||t('Tu próxima búsqueda','Your next search');
    preview.querySelector('span').textContent=[data.get('category'),scope].filter(Boolean).join(' · ');
  }
  form.addEventListener('input',updatePreview);
  form.addEventListener('change',updatePreview);
  form.addEventListener('reset',()=>setTimeout(updatePreview,0));
  window.addEventListener('colegiolibre:languagechange',updatePreview);
  updatePreview();
})();
