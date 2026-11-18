document.addEventListener('DOMContentLoaded', () => {
  const assistant = document.querySelector('#farmmind-voice-assistant');
  if (assistant) initIntake(assistant);
  const narration = document.querySelector('#dashboard-voice-narration');
  if (narration) initNarration(narration);
});

function initIntake(root) {
  const form=document.querySelector('#analysis-form'), log=root.querySelector('[data-chat-log]');
  const input=root.querySelector('[data-chat-input]'), status=root.querySelector('[data-chat-status]');
  const language=root.querySelector('[data-chat-language]'), start=root.querySelector('[data-chat-start]');
  const mic=root.querySelector('[data-chat-mic]'), send=root.querySelector('[data-chat-send]');
  const skip=root.querySelector('[data-chat-skip]'), finish=root.querySelector('[data-chat-finish]');
  const progress=root.querySelector('[data-chat-progress]');
  if(!form||!log||!input)return;
  const fields=[
    {key:'district',type:'text',en:'Which district is your farm in? You can say skip.',hi:'आपका खेत किस जिले में है? चाहें तो छोड़ें कहें।'},
    {key:'soil',type:'soil',en:'What type of soil do you have? For example, black, loamy, sandy or clayey.',hi:'आपके खेत में किस प्रकार की मिट्टी है? जैसे काली, दोमट, रेतीली या चिकनी।'},
    {key:'season',type:'season',en:'Which growing season are you planning for: Kharif, Rabi, Zaid or year-round?',hi:'आप किस मौसम में खेती करना चाहते हैं: खरीफ, रबी, जायद या पूरे साल?'},
    {key:'rainfall',type:'number',required:true,en:'What is the expected seasonal rainfall in millimetres?',hi:'मौसम के दौरान अनुमानित बारिश कितने मिलीमीटर होती है?'},
    {key:'temp',type:'number',required:true,en:'What is the average temperature in degrees Celsius?',hi:'औसत तापमान कितने डिग्री सेल्सियस रहता है?'},
    {key:'ph',type:'number',min:4,max:9,en:'Do you know your soil pH? It is usually between 4 and 9. Say skip if unknown.',hi:'क्या आपको मिट्टी का pH पता है? यह आमतौर पर 4 से 9 के बीच होता है। नहीं पता हो तो छोड़ें कहें।'},
    {key:'nitrogen',type:'nitrogen',en:'How is the soil nitrogen level: low, medium or high?',hi:'मिट्टी में नाइट्रोजन का स्तर कैसा है: कम, मध्यम या अधिक?'},
    {key:'water',type:'water',en:'What is the water availability: rainfed only, partial irrigation or full irrigation?',hi:'सिंचाई की सुविधा कैसी है: केवल बारिश पर निर्भर, आंशिक सिंचाई या पूरी सिंचाई?'},
    {key:'farm_size',type:'number',min:0.1,en:'How many acres is your farm?',hi:'आपका खेत कितने एकड़ का है?'},
    {key:'goal',type:'goal',en:'What is your main goal: maximum yield, high profit, soil health, water efficiency or organic farming?',hi:'आपका मुख्य उद्देश्य क्या है: अधिक उपज, अधिक मुनाफा, मिट्टी की सेहत, पानी की बचत या जैविक खेती?'}
  ];
  let step=-1,recognition=null,listening=false;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const t=(en,hi)=>language.value==='hi'?hi:en;
  function speak(text){if(!window.speechSynthesis)return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=language.value==='hi'?'hi-IN':'en-IN';u.rate=.92;const vs=speechSynthesis.getVoices();const v=vs.find(x=>x.lang.toLowerCase()===(language.value==='hi'?'hi-in':'en-in'))||vs.find(x=>x.lang.toLowerCase().startsWith(language.value==='hi'?'hi':'en'));if(v)u.voice=v;speechSynthesis.speak(u);}
  function message(text,who='bot',voice=true){const b=document.createElement('div');b.className='voice-message voice-message--'+who;b.textContent=text;log.appendChild(b);log.scrollTop=log.scrollHeight;if(who==='bot'&&voice)speak(text);}
  function ask(){if(step<0||step>=fields.length)return;progress.style.width=Math.round(step/fields.length*100)+'%';message(fields[step][language.value]);input.placeholder=t('Speak or type your answer…','अपना जवाब बोलें या लिखें…');input.focus();}
  function hidden(name,value){let e=form.querySelector('[name="'+name+'"]');if(!e){e=document.createElement('input');e.type='hidden';e.name=name;form.appendChild(e);}e.value=value;}
  function setField(key,value){if(key==='district'){hidden('district',value);const aliases={angul:'anugul',anugul:'anugul',balasore:'baleshwar',baleshwar:'baleshwar',baragarh:'bargarh',bargarh:'bargarh',bolangir:'balangir',balangir:'balangir',keonjhar:'kendujhar',kendujhar:'kendujhar',khurda:'khordha',khordha:'khordha',sonapur:'subarnapur',subarnapur:'subarnapur'};const keyName=String(value).toLowerCase().replace(/[^a-z]/g,'');hidden('district_key',aliases[keyName]||keyName);if(['anugul','baleshwar','bargarh','balangir','kendujhar','khordha','subarnapur'].includes(aliases[keyName]||keyName))hidden('state','Odisha');return;}const e=form.querySelector('[name="'+key+'"]');if(!e)return;e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
  const clean=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[।,!?]/g,' ').trim();
  function getNumber(s){const m={'०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9'};const z=String(s).replace(/[०-९]/g,c=>m[c]);const n=z.match(/-?\d+(?:\.\d+)?/);if(n)return Number(n[0]);const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,'एक':1,'दो':2,'तीन':3,'चार':4,'पांच':5,'पाँच':5,'छह':6,'सात':7,'आठ':8,'नौ':9,'दस':10};for(const w of clean(s).split(/\s+/))if(words[w]!==undefined)return words[w];return null;}
  function parse(f,raw){const s=clean(raw);if(/^(skip|pass|unknown|not sure|dont know|don't know|छोड़|छोड़|पता नहीं|नहीं पता|स्किप)$/.test(s))return f.required?{error:t('This value is needed for crop analysis. Please enter an estimate.','फसल विश्लेषण के लिए यह जानकारी ज़रूरी है। कृपया अनुमान बताएं।')}:{skip:true};if(f.type==='text')return raw.trim()?{value:raw.trim()}:null;if(f.type==='number'){const n=getNumber(raw);if(n===null)return null;if(f.min!==undefined&&n<f.min)return {error:t('That value is below the allowed range. Please try again.','यह मान सीमा से कम है। फिर से बताएं।')};if(f.max!==undefined&&n>f.max)return {error:t('That value is above the allowed range. Please try again.','यह मान सीमा से अधिक है। फिर से बताएं।')};return {value:n};}
    const has=(...a)=>a.some(x=>s.includes(x));
    const groups={
      soil:[['black cotton',['black','काली','काला','ब्लैक']],['loamy',['loam','दोमट','मटियार']],['sandy',['sand','रेतीली','बलुई','रेत']],['clayey',['clay','चिकनी']],['silty',['silt','गाद']],['alluvial',['alluvial','जलोढ़','जलोढ']],['red laterite',['laterite','red soil','लाल मिट्टी']],['peaty',['peat','पीट']]],
      season:[['kharif',['kharif','खरीफ','monsoon','बरसात']],['rabi',['rabi','रबी','winter','सर्दी']],['zaid',['zaid','जायद','summer','गर्मी']],['tropical',['year round','year-round','पूरे साल','साल भर','बारह महीने']],['semi-arid',['semi arid','अर्ध शुष्क']]],
      goal:[['yield',['yield','उपज','पैदावार']],['profit',['profit','मुनाफा','लाभ']],['soil',['soil health','मिट्टी की सेहत','मिट्टी सुधार']],['water',['water efficiency','save water','पानी बचाना','पानी की बचत']],['organic',['organic','जैविक']]]
    };
    if(groups[f.type]){const found=groups[f.type].find(([v,a])=>has(v,...a));return found?{value:found[0]}:null;}
    if(f.type==='nitrogen'){if(has('low','कम','निम्न'))return {value:'low'};if(has('medium','moderate','मध्यम'))return {value:'medium'};if(has('high','अधिक','ज्यादा','उच्च'))return {value:'high'};}
    if(f.type==='water'){if(has('rainfed','rain fed','केवल बारिश','बारिश पर निर्भर','सिर्फ बारिश'))return {value:'rainfed'};if(has('partial','limited','आंशिक','थोड़ी सिंचाई','कम सिंचाई'))return {value:'partial'};if(has('full','complete','पूरी सिंचाई','पूर्ण सिंचाई'))return {value:'full'};}
    return null;
  }
  function accept(raw){if(step<0||step>=fields.length)return;const f=fields[step],r=parse(f,raw);if(!r){message(t('I could not identify that answer. Please try a simpler answer, or skip if unknown.','मुझे जवाब समझ नहीं आया। सरल शब्दों में बताएं या जानकारी न होने पर छोड़ें।'));return;}if(r.error){message(r.error);return;}if(r.value!==undefined){setField(f.key,r.value);message(t('Saved '+f.key.replace('_',' ')+': '+r.value,'जानकारी दर्ज की गई: '+r.value),'bot',false);}else message(t('Skipped '+f.key.replace('_',' ')+'.','यह जानकारी छोड़ दी गई।'),'bot',false);step++;if(step<fields.length)ask();else{progress.style.width='100%';message(t('All done! I filled the form. Please review the values and press Find my best crops.','हो गया! मैंने फॉर्म भर दिया है। जानकारी जाँचें और Find my best crops दबाएँ।'));finish.hidden=false;form.querySelector('[name="soil"]')?.scrollIntoView({behavior:'smooth',block:'center'});}}
  function stop(){if(recognition&&listening){try{recognition.stop();}catch(_){}}}
  function listen(){if(!SR){status.textContent=t('Voice recognition is not supported here. Please type your answer.','इस ब्राउज़र में आवाज़ पहचान उपलब्ध नहीं है। कृपया जवाब लिखें।');return;}stop();recognition=new SR();recognition.lang=language.value==='hi'?'hi-IN':'en-IN';recognition.interimResults=false;recognition.continuous=false;recognition.maxAlternatives=1;recognition.onstart=()=>{listening=true;status.textContent=t('Listening… speak now.','सुन रहा हूँ… अब बोलें।');};recognition.onresult=e=>{const v=e.results[0][0].transcript;input.value=v;message(v,'user',false);accept(v);input.value='';};recognition.onerror=e=>status.textContent=t('Microphone error: '+e.error+'. You can type instead.','माइक्रोफ़ोन समस्या: '+e.error+'। आप लिख सकते हैं।');recognition.onend=()=>{listening=false;mic.textContent=t('🎙 Speak','🎙 बोलें');};try{recognition.start();}catch(_){status.textContent=t('Could not start microphone. Please type instead.','माइक्रोफ़ोन शुरू नहीं हुआ। कृपया लिखें।');}}
  start.addEventListener('click',()=>{step=0;log.innerHTML='';message(t('Namaste! I am your FarmMind assistant. I will ask a few questions and fill your field form. You can type, speak or skip optional details.','नमस्ते! मैं आपका FarmMind सहायक हूँ। मैं कुछ सवाल पूछकर आपके खेत का फॉर्म भरूँगा। आप बोल सकते हैं, लिख सकते हैं या वैकल्पिक जानकारी छोड़ सकते हैं।'));ask();});
  mic.addEventListener('click',()=>listening?stop():listen());
  send.addEventListener('click',()=>{const v=input.value.trim();if(v){message(v,'user',false);accept(v);input.value='';}});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();send.click();}});
  skip.addEventListener('click',()=>accept('skip'));
  finish.addEventListener('click',()=>form.requestSubmit());
  language.addEventListener('change',()=>{stop();message(t('Language set to English.','भाषा हिंदी में बदल दी गई।'));if(step>=0&&step<fields.length)ask();});
  status.textContent=SR?'Voice ready. Allow microphone access when prompted.':'Voice recognition unavailable in this browser; typed chat is available. Try Chrome or Edge for voice.';
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
