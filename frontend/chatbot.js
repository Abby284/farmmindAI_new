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

function initNarration(root) {
  const dataNode = document.querySelector('#dashboard-narration-data');
  const lang = root.querySelector('[data-narration-language]');
  const play = root.querySelector('[data-narration-play]');
  const stopButton = root.querySelector('[data-narration-stop]');
  const status = root.querySelector('[data-narration-status]');
  const textOutput = root.querySelector('[data-narration-text]');
  const scope = root.querySelector('[data-narration-scope]');
  if (!dataNode || !play) return;
  let data = {};
  try { data = JSON.parse(dataNode.textContent); } catch (_) {}
  let latestWhatif = null;
  let session = 0;
  let currentUtterance = null;
  const synth = window.speechSynthesis;
  const t = (en, hi) => lang.value === 'hi' ? hi : en;
  const num = n => Number(n || 0).toLocaleString('en-IN', {maximumFractionDigits:1});
  const cropName = item => item?.crop?.name || item?.crop || 'Unknown crop';
  const rank = data.ranked || [];
  function fullSummary() {
    const hi = lang.value === 'hi';
    const top = rank[0];
    if (!top) return t('No crop recommendations are available yet.', 'अभी फसल की सिफारिश उपलब्ध नहीं है।');
    const parts = [];
    if (hi) {
      parts.push('फार्ममाइंड की फसल योजना। ये अनुमान आपके दिए गए खेत के विवरण पर आधारित हैं, गारंटी नहीं।');
      parts.push((data.district ? data.district + ' जिले में, ' : '') + data.season + ' मौसम के लिए सबसे उपयुक्त फसल ' + cropName(top) + ' है। अनुकूलता स्कोर ' + num(top.pct) + ' प्रतिशत, जोखिम ' + top.risk_level + ', अनुमानित शुद्ध लाभ ' + num(top.profit?.net) + ' रुपये और लागत पर रिटर्न ' + num(top.profit?.roi) + ' प्रतिशत है।');
      if (rank.length > 1) parts.push('अन्य विकल्प: ' + rank.slice(1,4).map(x => cropName(x) + ', ' + num(x.pct) + ' प्रतिशत अनुकूलता और ' + num(x.profit?.net) + ' रुपये अनुमानित शुद्ध लाभ').join('; ') + '।');
      if (data.reasons?.length) parts.push('मुख्य कारण: ' + data.reasons.slice(0,3).join('; ') + '।');
      if (data.risks?.length) parts.push('ध्यान देने वाले जोखिम: ' + data.risks.slice(0,3).join('; ') + '।');
      parts.push('चार मौसम के बाद अनुमानित मिट्टी स्वास्थ्य स्कोर ' + num(data.soil_final) + ' में से 100 है। ' + (data.soil_advice || ''));
      if (data.rotation?.length) parts.push('अगले मौसमों का फसल चक्र: ' + data.rotation.map(x => x.season + ' में ' + x.crop + ', ' + x.note).join('; ') + '।');
      if (data.ml_crop) parts.push('ऐतिहासिक मॉडल में ' + data.ml_crop + (data.ml_yield !== '' ? ' की अनुमानित उपज ' + data.ml_yield + ' टन प्रति हेक्टेयर है।' : ' भी एक अलग मॉडल संकेत है।'));
      parts.push('बुवाई से पहले स्थानीय मौसम, मंडी भाव और खेत की मिट्टी जाँच की पुष्टि करें।');
    } else {
      parts.push('Here is your complete FarmMind crop plan. These are estimates based on your entered field conditions, not guarantees.');
      parts.push('For ' + (data.district ? data.district + ' district in ' : '') + data.season + ' season, the top recommendation is ' + cropName(top) + '. Field-fit score: ' + num(top.pct) + ' percent. Risk: ' + top.risk_level + '. Estimated net return: ' + num(top.profit?.net) + ' rupees, with ' + num(top.profit?.roi) + ' percent return on cost.');
      if (rank.length > 1) parts.push('Other leading choices are ' + rank.slice(1,4).map(x => cropName(x) + ', with ' + num(x.pct) + ' percent field fit and estimated net ' + num(x.profit?.net) + ' rupees').join('; ') + '.');
      if (data.reasons?.length) parts.push('Key reasons for the top match: ' + data.reasons.slice(0,3).join('; ') + '.');
      if (data.risks?.length) parts.push('Watch these risks: ' + data.risks.slice(0,3).join('; ') + '.');
      parts.push('The projected soil health after four seasons is ' + num(data.soil_final) + ' out of 100. ' + (data.soil_advice || ''));
      if (data.rotation?.length) parts.push('The proposed rotation is ' + data.rotation.map(x => x.crop + ' in ' + x.season + '. ' + x.note).join('; ') + '.');
      if (data.ml_crop) parts.push('A separate historical model highlights ' + data.ml_crop + (data.ml_yield !== '' ? ', with estimated yield ' + data.ml_yield + ' tonnes per hectare.' : '.'));
      parts.push('Before planting, confirm current weather, local market prices and a field soil test.');
    }
    return parts.join('\n\n');
  }
  function whatifSummary() {
    const p = latestWhatif;
    if (!p) return t('Select and calculate a What-If scenario first.', 'पहले व्हाट-इफ में कोई परिस्थिति चुनकर उसका परिणाम निकालें।');
    const rows = (p.results || []).slice(0,5);
    if (lang.value === 'hi') return 'व्हाट-इफ विश्लेषण: ' + p.scenario + '। ' +
      rows.map(x => cropName(x) + ' की अनुकूलता ' + num(x.old_pct) + ' से ' + num(x.new_pct) + ' प्रतिशत हुई, यानी ' + (x.delta > 0 ? 'बढ़त ' : x.delta < 0 ? 'कमी ' : 'कोई बदलाव नहीं, ') + num(Math.abs(x.delta)) + ' प्रतिशत अंक').join('; ') +
      '। यह एक अनुमानित परिस्थिति है, वास्तविक परिणाम की गारंटी नहीं।';
    return 'What-If scenario: ' + p.scenario + '. ' +
      rows.map(x => cropName(x) + ' changes from ' + num(x.old_pct) + ' to ' + num(x.new_pct) + ' percent field fit, a change of ' + num(x.delta) + ' percentage points').join('; ') +
      '. This is a simulated change, not a guaranteed outcome.';
  }
  function cancel() {
    session++;
    currentUtterance = null;
    if (synth) synth.cancel();
  }
  function splitSpeech(text) {
    return text.replace(/\n+/g,' ').match(/[^.!?।]+[.!?।]?/g)?.flatMap(sentence => {
      const chunks = [];
      const words = sentence.trim().split(/\s+/);
      let part = '';
      for (const word of words) {
        if ((part + ' ' + word).length > 150 && part) { chunks.push(part); part = word; }
        else part += (part ? ' ' : '') + word;
      }
      if (part) chunks.push(part);
      return chunks;
    }) || [];
  }
  async function narrate() {
    const isWhatif = scope.value === 'whatif';
    if (isWhatif && !latestWhatif) {
      status.textContent = t('Calculate a What-If scenario first.','पहले What-If परिस्थिति का परिणाम निकालें।');
      return;
    }
    const fallback = isWhatif ? whatifSummary() : fullSummary();
    textOutput.textContent = fallback;
    cancel();
    const token = session;
    let speechText = fallback;
    status.textContent = t('Asking Gemini to explain your results…','Gemini से आपके परिणाम समझाने के लिए कह रहे हैं…');
    try {
      const response = await fetch(`${window.FARMMIND_API_BASE}/api/narrate`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          language: lang.value,
          scope: isWhatif ? 'whatif' : 'plan',
          data: isWhatif ? latestWhatif : data
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.text) throw new Error(payload.error || 'AI narration unavailable');
      speechText = payload.text;
      status.textContent = t('Gemini explanation ready. Preparing audio…','Gemini की व्याख्या तैयार है। आवाज़ शुरू हो रही है…');
    } catch (error) {
      status.textContent = t('Using FarmMind’s built-in explanation because AI is unavailable.','AI उपलब्ध नहीं है, इसलिए FarmMind का तैयार सारांश सुनाया जाएगा।');
    }
    if (token !== session) return;
    textOutput.textContent = speechText;
    if (!synth || !window.SpeechSynthesisUtterance) {
      status.textContent = t('Audio is unavailable in this browser. Read the complete explanation below.', 'इस ब्राउज़र में आवाज़ उपलब्ध नहीं है। पूरी व्याख्या नीचे पढ़ें।');
      return;
    }
    const chunks = splitSpeech(speechText);
    const voices = synth.getVoices();
    const locale = lang.value === 'hi' ? 'hi-IN' : 'en-IN';
    const voice = voices.find(v => v.lang.toLowerCase() === locale.toLowerCase())
      || voices.find(v => v.lang.toLowerCase().startsWith(lang.value));
    let index = 0;
    function next() {
      if (token !== session) return;
      if (index >= chunks.length) {
        currentUtterance = null;
        status.textContent = t('Narration complete.', 'सारांश पूरा पढ़ लिया गया।');
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index++]);
      utterance.lang = locale;
      utterance.rate = 0.9;
      if (voice) utterance.voice = voice;
      utterance.onend = next;
      utterance.onerror = event => {
        if (token !== session || event.error === 'canceled' || event.error === 'interrupted') return;
        status.textContent = t('Audio stopped. The complete written explanation is below.', 'आवाज़ रुक गई। पूरी लिखित व्याख्या नीचे है।');
      };
      currentUtterance = utterance;
      status.textContent = t('Reading section ' + index + ' of ' + chunks.length + '…', 'भाग ' + index + ' / ' + chunks.length + ' पढ़ा जा रहा है…');
      synth.speak(utterance);
    }
    next();
  }
  play.addEventListener('click', narrate);
  stopButton.addEventListener('click', () => { cancel(); status.textContent = t('Narration stopped.', 'आवाज़ रोक दी गई।'); });
  lang.addEventListener('change', () => { cancel(); textOutput.textContent = ''; status.textContent = ''; });
  scope.addEventListener('change', () => { cancel(); textOutput.textContent = ''; });
  document.addEventListener('farmmind:whatif-result', event => {
    latestWhatif = event.detail;
    if (scope.value === 'whatif') {
      textOutput.textContent = whatifSummary();
      status.textContent = t('Scenario ready. Press Listen to hear its explanation.', 'परिस्थिति तैयार है। सुनने के लिए बटन दबाएँ।');
    }
  });
  textOutput.textContent = fullSummary();
}
