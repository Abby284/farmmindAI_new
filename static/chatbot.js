document.addEventListener('DOMContentLoaded', () => {
  const assistant = document.querySelector('#farmmind-voice-assistant');
  if (assistant) initIntake(assistant);
  const narration = document.querySelector('#dashboard-voice-narration');
  if (narration) initNarration(narration);
});

function initIntake(root) {
  const form = document.querySelector('#analysis-form');
  const log = root.querySelector('[data-chat-log]');
  const input = root.querySelector('[data-chat-input]');
  const status = root.querySelector('[data-chat-status]');
  const language = root.querySelector('[data-chat-language]');
  const start = root.querySelector('[data-chat-start]');
  const send = root.querySelector('[data-chat-send]');
  const skip = root.querySelector('[data-chat-skip]');
  const finish = root.querySelector('[data-chat-finish]');
  const progress = root.querySelector('[data-chat-progress]');
  if (!form || !log || !input) return;

  const fields = [
    { key:'district', kind:'text', optional:true,
      en:'Which district is your farm in?', hi:'आपका खेत किस जिले में है?',
      hintEn:'Type the district name, for example Angul. You can skip this.',
      hintHi:'जिले का नाम लिखें, जैसे अंगुल। चाहें तो छोड़ सकते हैं।' },
    { key:'soil', kind:'choice', en:'What type of soil do you have?', hi:'आपके खेत की मिट्टी किस प्रकार की है?',
      options:[
        ['black cotton','Black soil','काली मिट्टी'],['loamy','Loamy','दोमट'],
        ['sandy','Sandy','रेतीली'],['clayey','Clayey','चिकनी'],
        ['silty','Silty','गाद वाली'],['alluvial','Alluvial','जलोढ़'],
        ['red laterite','Red / laterite','लाल / लेटराइट'],['peaty','Peaty','पीट वाली']
      ]},
    { key:'season', kind:'choice', en:'Which growing season are you planning for?', hi:'आप किस मौसम में खेती करना चाहते हैं?',
      options:[
        ['kharif','Kharif / Monsoon','खरीफ / बरसात'],['rabi','Rabi / Winter','रबी / सर्दी'],
        ['zaid','Zaid / Summer','जायद / गर्मी'],['tropical','Year-round','पूरे साल'],
        ['semi-arid','Semi-arid','अर्ध-शुष्क']
      ]},
    { key:'rainfall', kind:'number', required:true, min:0, max:5000, step:1, unit:'mm',
      en:'What is the expected seasonal rainfall?', hi:'मौसम में अनुमानित कुल बारिश कितनी होती है?',
      hintEn:'Enter a number in millimetres (for example 850).', hintHi:'मिलीमीटर में संख्या लिखें (जैसे 850)।'},
    { key:'temp', kind:'number', required:true, min:0, max:55, step:0.1, unit:'°C',
      en:'What is the average temperature?', hi:'औसत तापमान कितना रहता है?',
      hintEn:'Enter degrees Celsius (for example 28).', hintHi:'डिग्री सेल्सियस में लिखें (जैसे 28)।'},
    { key:'ph', kind:'number', optional:true, min:4, max:9, step:0.1, unit:'pH',
      en:'Do you know your soil pH?', hi:'क्या आपको मिट्टी का pH पता है?',
      hintEn:'Enter a value from 4 to 9, or skip if you do not know.', hintHi:'4 से 9 के बीच मान लिखें, या जानकारी न हो तो छोड़ें।'},
    { key:'nitrogen', kind:'choice', en:'How is the soil nitrogen level?', hi:'मिट्टी में नाइट्रोजन का स्तर कैसा है?',
      options:[['low','Low','कम'],['medium','Medium','मध्यम'],['high','High','अधिक']]},
    { key:'water', kind:'choice', en:'How much irrigation water is available?', hi:'सिंचाई के लिए पानी कितना उपलब्ध है?',
      options:[['rainfed','Rainfed only','केवल बारिश'],['partial','Partial irrigation','आंशिक सिंचाई'],['full','Full irrigation','पूरी सिंचाई']]},
    { key:'farm_size', kind:'number', required:true, min:1, max:100000, step:0.1, unit:'acres',
      en:'How large is your farm?', hi:'आपका खेत कितने एकड़ का है?',
      hintEn:'Enter the farm area in acres (for example 5).', hintHi:'एकड़ में खेत का क्षेत्रफल लिखें (जैसे 5)।'},
    { key:'goal', kind:'choice', en:'What matters most to you?', hi:'आपके लिए सबसे ज़रूरी क्या है?',
      options:[['yield','Maximum yield','अधिक उपज'],['profit','Higher profit','अधिक मुनाफा'],
        ['soil','Soil health','मिट्टी की सेहत'],['water','Save water','पानी की बचत'],['organic','Organic farming','जैविक खेती']]}
  ];

  let step = -1;
  const t = (en, hi) => language.value === 'hi' ? hi : en;
  const speak = text => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language.value === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.94;
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.toLowerCase() === (language.value === 'hi' ? 'hi-in' : 'en-in'))
      || voices.find(v => v.lang.toLowerCase().startsWith(language.value === 'hi' ? 'hi' : 'en'));
    if (voice) utterance.voice = voice;
    speechSynthesis.speak(utterance);
  };
  function message(text, who='bot', shouldSpeak=true) {
    const bubble = document.createElement('div');
    bubble.className = 'voice-message voice-message--' + who;
    bubble.textContent = text;
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    if (who === 'bot' && shouldSpeak) speak(text);
  }
  function hidden(name, value) {
    let el = form.querySelector('[name="' + name + '"]');
    if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.name = name; form.appendChild(el); }
    el.value = value;
  }
  function setField(key, value) {
    if (key === 'district') {
      hidden('district', value);
      const aliases = {
        angul:'anugul',anugul:'anugul',balasore:'baleshwar',baleshwar:'baleshwar',
        baragarh:'bargarh',bargarh:'bargarh',bolangir:'balangir',balangir:'balangir',
        keonjhar:'kendujhar',kendujhar:'kendujhar',khurda:'khordha',khordha:'khordha',
        sonapur:'subarnapur',subarnapur:'subarnapur'
      };
      const keyName = String(value).toLowerCase().replace(/[^a-z]/g,'');
      const districtKey = aliases[String(value).toLowerCase()] || aliases[keyName] || keyName;
      hidden('district_key', districtKey);
      if (['anugul','baleshwar','bargarh','balangir','kendujhar','khordha','subarnapur'].includes(districtKey)) hidden('state','Odisha');
      return;
    }
    const field = form.querySelector('[name="' + key + '"]');
    if (!field) return;
    field.value = value;
    field.dispatchEvent(new Event('input',{bubbles:true}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function updateProgress() { progress.style.width = Math.round(Math.max(0,step) / fields.length * 100) + '%'; }
  function renderQuestion() {
    if (step < 0 || step >= fields.length) return;
    const field = fields[step];
    updateProgress();
    message(t(field.en, field.hi));
    const hint = t(field.hintEn || 'Choose one option below.', field.hintHi || 'नीचे एक विकल्प चुनें।');
    const hintNode = document.createElement('div');
    hintNode.className = 'voice-assistant__hint';
    hintNode.textContent = hint;
    log.appendChild(hintNode);
    if (field.kind === 'choice') {
      const choices = document.createElement('div');
      choices.className = 'voice-assistant__choices';
      field.options.forEach(([value,en,hi]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'voice-assistant__choice';
        button.dataset.answer = value;
        button.textContent = t(en,hi);
        choices.appendChild(button);
      });
      log.appendChild(choices);
      input.hidden = true;
      send.hidden = true;
      skip.hidden = !field.optional;
    } else {
      input.hidden = false;
      send.hidden = false;
      input.value = '';
      input.type = field.kind === 'number' ? 'number' : 'text';
      input.min = field.min ?? '';
      input.max = field.max ?? '';
      input.step = field.step ?? '1';
      input.placeholder = field.kind === 'number' ? t('Enter a number…','संख्या लिखें…') : t('Type district name…','जिले का नाम लिखें…');
      input.focus();
      skip.hidden = !field.optional;
    }
    log.scrollTop = log.scrollHeight;
  }
  function next(value) {
    const field = fields[step];
    setField(field.key, value);
    message(t('Saved: ','दर्ज किया: ') + (field.key === 'district' ? value : String(value)), 'bot', false);
    step += 1;
    if (step < fields.length) renderQuestion();
    else {
      progress.style.width = '100%';
      input.hidden = true; send.hidden = true; skip.hidden = true;
      message(t('That is everything! Your field form is filled in. Review the values below, then choose Find my best crops.','सभी सवाल पूरे हुए! आपके खेत का फॉर्म भर गया है। नीचे जानकारी जाँचें और Find my best crops दबाएँ।'));
      finish.hidden = false;
      form.scrollIntoView({behavior:'smooth',block:'start'});
    }
  }
  function submitTyped() {
    if (step < 0 || step >= fields.length) return;
    const field = fields[step];
    const raw = input.value.trim();
    if (!raw) { status.textContent = t('Please enter an answer.','कृपया जवाब लिखें।'); return; }
    if (field.kind === 'number') {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < field.min || value > field.max) {
        status.textContent = t('Enter a value from '+field.min+' to '+field.max+'.','कृपया '+field.min+' से '+field.max+' के बीच मान लिखें।');
        return;
      }
      next(value);
    } else {
      if (raw.length > 60) { status.textContent = t('Please enter only the district name.','कृपया केवल जिले का नाम लिखें।'); return; }
      next(raw);
    }
    status.textContent = '';
  }
  start.addEventListener('click', () => {
    step = 0; log.innerHTML = ''; finish.hidden = true;
    message(t('Namaste! I will ask one simple question at a time. Tap an option or enter a short answer.','नमस्ते! मैं एक बार में एक आसान सवाल पूछूँगा। विकल्प चुनें या छोटा जवाब लिखें।'));
    renderQuestion();
  });
  log.addEventListener('click', event => {
    const button = event.target.closest('[data-answer]');
    if (!button || step < 0 || step >= fields.length) return;
    message(button.textContent,'user',false);
    next(button.dataset.answer);
  });
  send.addEventListener('click',submitTyped);
  input.addEventListener('keydown',event => { if(event.key==='Enter'){event.preventDefault();submitTyped();} });
  skip.addEventListener('click',() => {
    if(step<0 || !fields[step].optional) return;
    message(t('Skip','छोड़ें'),'user',false);
    step += 1;
    if(step<fields.length) renderQuestion();
    else { progress.style.width='100%'; message(t('All done. Review your field details below.','हो गया। नीचे अपने खेत की जानकारी जाँचें।')); finish.hidden=false; }
  });
  finish.addEventListener('click',() => form.requestSubmit());
  language.addEventListener('change',() => {
    if(step>=0 && step<fields.length) renderQuestion();
    status.textContent = t('Language changed to English.','भाषा हिंदी कर दी गई है।');
  });
  status.textContent = t('Choose an answer to continue. Voice input is optional; the questionnaire works without a microphone.','आगे बढ़ने के लिए जवाब चुनें। माइक्रोफ़ोन ज़रूरी नहीं है।');
}

function initNarration(root){
  const node=document.querySelector('#dashboard-narration-data'),lang=root.querySelector('[data-narration-language]');
  const play=root.querySelector('[data-narration-play]'),stop=root.querySelector('[data-narration-stop]'),status=root.querySelector('[data-narration-status]');
  if(!node||!play||!window.speechSynthesis)return;
  let d={};try{d=JSON.parse(node.textContent);}catch(_){}
  function summary(hi){const crop=d.crop||'',score=d.score??'',risk=d.risk||'',net=Number(d.net||0).toLocaleString('en-IN'),roi=d.roi??'',season=d.season||'',place=d.district||'';const extra=d.ml_crop?(hi?' ऐतिहासिक उपज मॉडल में '+d.ml_crop+' का अनुमानित उत्पादन '+d.ml_yield+' टन प्रति हेक्टेयर है।':' The historical yield model estimates '+d.ml_crop+' at '+d.ml_yield+' tonnes per hectare.'):'';if(hi)return 'आपके खेत के विश्लेषण का सारांश। '+(place?place+' जिले के लिए ':'')+'आपकी '+season+' ऋतु में सबसे उपयुक्त फसल '+crop+' है। इसका खेत अनुकूलता स्कोर '+score+' प्रतिशत है और जोखिम स्तर '+(risk==='low'?'कम':risk==='medium'?'मध्यम':'अधिक')+' है। अनुमानित शुद्ध लाभ '+net+' रुपये है और लागत पर अनुमानित रिटर्न '+roi+' प्रतिशत है। ये अनुमान दर्ज की गई जानकारी और मॉडल की मान्यताओं पर आधारित हैं, गारंटी नहीं। बुवाई से पहले स्थानीय मौसम, मंडी भाव और मिट्टी परीक्षण की जाँच करें।'+extra;return 'Here is your FarmMind field summary. '+(place?'For '+place+' district, ':'')+'in the '+season+' season, the top recommended crop is '+crop+'. Its field suitability score is '+score+' percent, with '+risk+' risk. Estimated net profit is rupees '+net+', and estimated return on cost is '+roi+' percent. These are model-based estimates, not guarantees. Before planting, check local weather, current market prices and a field soil test.'+extra;}
  play.addEventListener('click',()=>{speechSynthesis.cancel();const hi=lang.value==='hi',u=new SpeechSynthesisUtterance(summary(hi));u.lang=hi?'hi-IN':'en-IN';u.rate=.9;const vs=speechSynthesis.getVoices(),v=vs.find(x=>x.lang.toLowerCase()===(hi?'hi-in':'en-in'))||vs.find(x=>x.lang.toLowerCase().startsWith(hi?'hi':'en'));if(v)u.voice=v;u.onstart=()=>status.textContent=hi?'डैशबोर्ड सारांश पढ़ा जा रहा है…':'Reading dashboard summary…';u.onend=()=>status.textContent=hi?'सारांश पूरा हुआ।':'Summary finished.';u.onerror=()=>status.textContent='Speech playback failed.';speechSynthesis.speak(u);});
  stop.addEventListener('click',()=>{speechSynthesis.cancel();status.textContent='';});
}
