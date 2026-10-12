/* =========================================================
 * story.js — ข้อมูลเนื้อเรื่องทั้งหมดของเกม (แก้/เพิ่มเหตุการณ์ได้ที่นี่)
 * ข้อความในเกมเป็นภาษาอังกฤษแบบง่าย อ่านได้สำหรับเด็ก
 *
 * โครงสร้างเหตุการณ์ (event):
 *   id       : รหัสไม่ซ้ำ (ภาษาอังกฤษ ใช้เก็บลง cookie)
 *   days     : [วันแรก, วันสุดท้าย] ที่เหตุการณ์นี้สุ่มออกได้
 *   when(s)  : เงื่อนไขเพิ่มเติม (เช่น ต้องมีไอเท็มบางอย่าง)
 *   weight   : น้ำหนักการสุ่ม (ตัวเลข หรือฟังก์ชันของ state)
 *   repeat   : true = เกิดซ้ำได้, ไม่ใส่ = เกิดครั้งเดียวต่อรอบ
 *   weather  : 'rain' | 'storm' | 'night' เปลี่ยนฉากด้านบน (และเสียงบรรยากาศ)
 *   choices  : ตัวเลือก
 *     req(s) / lock : เงื่อนไขปลดล็อก + ข้อความตอนล็อก
 *     show(s)       : ไม่ใส่ = แสดงเสมอ, false = ซ่อนตัวเลือกนี้ไปเลย
 *     outcomes      : ผลลัพธ์ที่เป็นไปได้ (สุ่มตาม p)
 *       p     : โอกาส (ตัวเลข/ฟังก์ชัน) ไม่ใส่ = แบ่งโอกาสที่เหลือ
 *       fx    : { hp, energy, food, mood } ค่าที่เปลี่ยน
 *       set   : { flag: ค่า } ตั้งค่าไอเท็ม (0 = เอาออก)
 *       add   : { flag: n } บวกจำนวนไอเท็ม (มีเพดานใน engine)
 *       cause : สาเหตุถ้าพลังชีวิตหมด (default = 'injury')
 *       keep  : true = ไม่นับว่าเหตุการณ์นี้ถูกใช้ไปแล้ว
 *       bonus : [{ if(s), text, fx }] ผลพิเศษเพิ่มเมื่อเข้าเงื่อนไข
 *       end   : รหัสฉากจบ (หรือฟังก์ชันคืนรหัส) = จบเกมทันที
 * ========================================================= */
(function (root) {
  'use strict';
  const TBS = root.TBS = root.TBS || {};

  const has = (k, n = 1) => s => (s.f[k] || 0) >= n;
  const lacks = k => s => !s.f[k];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const NEED_FIRE = 'Need a 🔥 Campfire';
  const NEED_HUT = 'Need a 🛖 Hut';
  const RAFT_DONE = 'Your raft is already finished';

  /* ฉากจบเมื่อเลือกอยู่บนเกาะต่อ — เงื่อนไขซ้อนกันหลายชั้น */
  function stayEnding(s) {
    if ((s.f.monkey || 0) >= 2 && s.mood >= 40) return 'monkey';
    if (s.f.shelter && s.mood >= 50) return 'king';
    return 'hermit';
  }

  TBS.STAT_META = {
    hp:     { icon: '❤️', name: 'Health' },
    energy: { icon: '⚡', name: 'Energy' },
    food:   { icon: '🍖', name: 'Food' },
    mood:   { icon: '😊', name: 'Happy' }
  };

  TBS.ITEMS = {
    fire:     { icon: '🔥', name: 'Campfire', desc: 'Cook food, make medicine, and build a signal fire. +4 Happy every night.' },
    shelter:  { icon: '🛖', name: 'Hut', desc: 'Sleep better and get more energy every night. Safe from storms.' },
    raft:     { icon: '🛶', name: v => v >= 3 ? 'Raft Ready!' : `Raft ${v}/3`, desc: 'Get 3 raft pieces to sail away on Day 10.' },
    signal:   { icon: '🆘', name: v => v >= 2 ? 'Big Signal' : 'S.O.S. Sign', desc: 'The stronger your signal, the more likely a ship sees you on Day 10.' },
    knife:    { icon: '🔪', name: 'Pocket Knife', desc: 'Better fishing, and it helps keep you safe.' },
    rod:      { icon: '🎣', name: 'Fishing Rod', desc: 'Catch fish much more easily.' },
    map:      { icon: '🗺️', name: 'Treasure Map', desc: 'A red X marks a giant tree...' },
    treasure: { icon: '💎', name: 'Treasure Chest', desc: "You can't eat it... but if you get home..." },
    monkey:   { icon: '🐒', name: v => v >= 2 ? 'Monkey Gang' : 'Little Monkey', desc: 'Furry friends! The monkey gang shares bananas every night.' },
    wilson:   { icon: '🥥', name: 'Wilson', desc: 'Your coconut best friend. +3 Happy every night.' },
    nav:      { icon: '⭐', name: 'Star Reader', desc: "You can find your way at sea. You won't get lost on a raft." },
    karma:    { icon: '🍀', name: 'Good Luck', desc: 'Luck is on your side on the last day.' },
    injured:  { icon: '🤕', name: 'Hurt', bad: true, desc: 'Lose 8 Health every night until you heal.' },
    wreck:    { icon: '⚓', name: 'Shipwreck Spot', desc: 'There might be useful things left inside.' }
  };

  /* ข้อความสรุปตอนกลางคืน (engine เป็นคนคำนวณตัวเลข) */
  TBS.NIGHT = {
    hunger:        { stat: 'food',   text: '🍖 Your tummy is rumbling' },
    monkeyfood:    { stat: 'food',   text: '🐒 The monkeys share their bananas' },
    fatigue:       { stat: 'energy', text: '🥵 The hot sun made you tired' },
    sleep_shelter: { stat: 'energy', text: '🛖 Cozy sleep in your hut' },
    sleep_sand:    { stat: 'energy', text: "🏖️ Sleeping on hard sand isn't comfy" },
    lonely:        { stat: 'mood',   text: '😶 You feel a little lonely' },
    fire:          { stat: 'mood',   text: '🔥 The warm campfire cheers you up' },
    wilson:        { stat: 'mood',   text: '🥥 You chat with Wilson before bed' },
    starving:      { stat: 'hp',     text: '😵 You are starving! Your body is weak' },
    hungry:        { stat: 'hp',     text: "😣 So hungry it's hard to think" },
    collapse:      { stat: 'hp',     text: '😵 Too tired to even stand up' },
    tired:         { stat: 'hp',     text: '🥱 You feel worn out' },
    despair:       { stat: 'hp',     text: '🌧️ You feel very, very sad' },
    sad:           { stat: 'hp',     text: '😞 You feel down' },
    wound:         { stat: 'hp',     text: '🤕 Your wound still hurts' },
    healthy:       { stat: 'hp',     text: '💪 Full tummy, good rest, happy heart. You feel stronger!' },
    rest:          { stat: 'hp',     text: '😌 You rest a little' }
  };

  TBS.ENDINGS = {
    rescue: {
      icon: '🚢', title: 'Rescued by Ship!', tone: 'good',
      text: 'The fishing crew pulls you on board. They give you a warm blanket and a bowl of hot soup. You wave goodbye to the little island. What an adventure!',
      hint: 'Make a signal for help and survive until Day 10.'
    },
    raft: {
      icon: '🛶', title: 'Sailed Home!', tone: 'good',
      text: 'Your homemade raft carries you across the sea to a fishing village. Everyone runs to the beach and cheers! People will talk about your amazing raft trip for years.',
      hint: 'Collect all 3 raft pieces and have enough food and energy.'
    },
    king: {
      icon: '👑', title: 'King of the Island', tone: 'good',
      text: 'You decide to stay. You have a cozy hut, plenty of food, and a happy heart. This island is your kingdom, and you are its king!',
      hint: 'Build a hut, stay happy, and choose to stay.'
    },
    rich: {
      icon: '💎', title: 'Rich and Rescued!', tone: 'secret',
      text: 'You get home with an old treasure chest! You are on the news: "Island Survivor Finds Pirate Gold!" Now you could buy your own island... but maybe not.',
      hint: 'A secret is hiding inside a bottle on the beach...'
    },
    monkey: {
      icon: '🐒', title: 'Monkey Boss', tone: 'secret',
      text: 'The monkeys make you their new leader! Every morning they bring you bananas. Every evening they brush your hair. Life is good. Ooh ooh, ah ah!',
      hint: 'Being kind to a small animal can lead to big things.'
    },
    hermit: {
      icon: '🧔', title: 'The Island Hermit', tone: 'neutral',
      text: 'You survived... but just barely. Your hair and beard grow long. You collect shells and talk to yourself. Maybe a ship will come one day. Maybe...',
      hint: 'Survive to the last day, but with no way to leave.'
    },
    lostsea: {
      icon: '🌊', title: 'Lost at Sea', tone: 'bad', dead: true,
      text: 'Your food and energy ran out. Your raft drifted far, far away... Next time, get ready before you sail!',
      hint: 'Sail away before you are ready.'
    },
    starve: {
      icon: '🍽️', title: 'Too Hungry', tone: 'bad', dead: true,
      text: 'Your tummy was empty for too many days, and your body got too weak to go on. You dream of a giant pizza... Next time, find more food!',
      hint: 'Let your food run out.'
    },
    exhaust: {
      icon: '😴', title: 'Too Tired', tone: 'bad', dead: true,
      text: 'You worked too hard and forgot to rest. Your body switched off like a toy with dead batteries. Resting is important too!',
      hint: 'Work hard without resting.'
    },
    madness: {
      icon: '🥥', title: 'Coconut Brain', tone: 'bad', dead: true,
      text: 'Being lonely and sad for so long made you a little... strange. One day you decided you were a coconut. Now you just sit in the sand all day, being a coconut. Next time, find ways to stay happy!',
      hint: 'Let your happiness run out.'
    },
    injury: {
      icon: '🦈', title: 'Too Many Ouchies', tone: 'bad', dead: true,
      text: "Too many cuts, bites, and bumps! Your body couldn't take any more. This island is beautiful, but it's also dangerous. Be careful out there!",
      hint: 'Get hurt again and again until your health runs out.'
    }
  };

  TBS.EVENTS = [
    /* ---------- วันที่ 1 (บังคับ) ---------- */
    {
      id: 'intro', icon: '🌊', title: 'Wake Up on the Beach', days: [1, 1],
      text: "Splash! A wave wakes you up. Last night, a big storm sank your ship. Now you are all alone on a sandy beach with palm trees and one wet backpack. A rescue ship might come in about 10 days... if you can survive until then!",
      choices: [
        { text: 'Look inside the wet backpack', outcomes: [
          { p: .5, text: "You find a lighter, and it still works! At least you'll be warm tonight.", fx: { mood: 5 }, set: { fire: 1 } },
          { text: 'You find two packs of crackers and some mint candy. Not a feast, but better than nothing!', fx: { food: 15, mood: 5 } }
        ] },
        { text: 'Climb a palm tree for coconuts', outcomes: [
          { p: .75, text: 'You knock down three coconuts. The cool coconut water is the best drink ever!', fx: { energy: -10, food: 20 } },
          { text: 'Halfway up, your hands slip. Bump! You land on your bottom. At least you grabbed one coconut.', fx: { energy: -10, food: 8, hp: -10 }, cause: 'injury' }
        ] },
        { text: 'Explore the beach', outcomes: [
          { p: .6, text: 'At the end of the beach, you spot a broken lifeboat! There might be useful things inside. You remember the spot.', fx: { energy: -10, mood: 5 }, set: { wreck: 1 } },
          { text: 'You find a coconut with a crack that looks like a smiling face. You name it "Wilson." Now you have a friend to talk to!', fx: { energy: -5, mood: 10 }, set: { wilson: 1 } }
        ] }
      ]
    },

    /* ---------- เหตุการณ์ประจำ (เกิดซ้ำได้) ---------- */
    {
      id: 'routine', icon: '☀️', title: 'A New Morning', repeat: true, weight: 3,
      text: 'The sun is up and your tummy is growling. The sea is calm today. What will you do?',
      choices: [
        { text: 'Go fishing by the rocks', outcomes: [
          { p: s => .5 + (s.f.rod ? .3 : 0) + (s.f.knife ? .1 : 0), text: 'You catch a big fish! Dinner is going to be great.', fx: { energy: -15, food: 25 },
            bonus: [{ if: has('fire'), text: '🔥 You cook it over the campfire. Yum! Better than a restaurant!', fx: { mood: 8 } }] },
          { text: "You stand in the water all day. The fish swim right past your legs like they're teasing you. You only find a few tiny clams.", fx: { energy: -15, food: 5, mood: -5 } }
        ] },
        { text: 'Pick fruit in the jungle', outcomes: [
          { p: .8, text: 'You find wild bananas and ripe mangoes. Your arms are full!', fx: { energy: -10, food: 15, mood: 3 } },
          { text: 'You eat a pretty mushroom... Bad idea! Your tummy hurts all afternoon.', fx: { energy: -10, food: 5, hp: -12, mood: -5 }, cause: 'injury' }
        ] },
        { text: 'Nap under a shady tree', outcomes: [
          { text: 'You take a long, lazy nap. You wake up feeling much better!', fx: { energy: 25, mood: 5, food: -5 } }
        ] },
        { text: 'Work on your raft', show: s => (s.f.raft || 0) >= 1 && (s.f.raft || 0) < 3, outcomes: [
          { text: 'You spend the day tying wood together. Your raft gets stronger!', fx: { energy: -20, mood: 3 }, add: { raft: 1 } }
        ] }
      ]
    },
    {
      id: 'rain', icon: '🌧️', title: 'Heavy Rain', weather: 'rain', repeat: true, weight: 1.5,
      text: 'Big dark clouds roll in. Then the rain pours down. Splish, splash, splash!',
      choices: [
        { text: 'Stay dry in your hut', req: has('shelter'), lock: NEED_HUT, outcomes: [
          { text: 'You listen to the rain tapping on the roof. Cozy and safe. You take a nice nap.', fx: { energy: 15, mood: 10 } }
        ] },
        { text: 'Catch rainwater to drink', outcomes: [
          { text: "The fresh rainwater tastes great and you feel healthier. But you're soaking wet!", fx: { hp: 8, mood: -3 } }
        ] },
        { text: 'Dance in the rain', outcomes: [
          { p: .65, text: "You dance like nobody's watching. All your worries wash away!", fx: { mood: 18, energy: -10 } },
          { text: 'You dance so long that you catch a cold. Achoo! Achoo!', fx: { mood: 8, energy: -10, hp: -10 }, cause: 'injury' }
        ] }
      ]
    },
    {
      id: 'crab', icon: '🦀', title: 'Crab Parade', repeat: true, weight: 1.5,
      text: 'Hundreds of crabs march across the beach in a long line, just like a parade!',
      choices: [
        { text: 'Catch some and cook them', req: has('fire'), lock: NEED_FIRE, outcomes: [
          { text: 'The cooked crabs smell amazing. You eat until your tummy is round!', fx: { energy: -8, food: 25, mood: 8 } }
        ] },
        { text: 'Catch some and eat them raw', outcomes: [
          { p: .6, text: 'Not very tasty, but it fills you up.', fx: { energy: -8, food: 15 } },
          { text: 'Uh-oh. Your tummy is very upset. You spend the night running to the bushes!', fx: { energy: -15, food: 5, hp: -10, mood: -8 }, cause: 'injury' }
        ] },
        { text: 'Sit and watch the parade', outcomes: [
          { text: 'The last crab stops and waves its claw at you. So cute!', fx: { mood: 12, energy: 3 } }
        ] }
      ]
    },
    {
      id: 'stars', icon: '🌌', title: 'Starry Night', weather: 'night', repeat: true, weight: 1.2,
      text: 'There are no city lights here, so the sky is full of stars. The Milky Way stretches right over your head.',
      choices: [
        { text: 'Count stars until you fall asleep', outcomes: [
          { text: 'You count 347 stars, then fall fast asleep. Your best dream since the shipwreck!', fx: { mood: 15, energy: 8 } }
        ] },
        { text: 'Learn the stars to find directions', req: lacks('nav'), lock: 'You already know the stars', outcomes: [
          { text: "You learn how to find the North Star. If you sail a raft, you won't get lost!", fx: { energy: -5, mood: 5 }, set: { nav: 1 } }
        ] },
        { text: 'Wish on a shooting star', outcomes: [
          { p: .5, text: 'Whoosh! A shooting star zooms across the sky! You feel lucky.', fx: { mood: 10 }, set: { karma: 1 } },
          { text: 'You wait all night, but no shooting star. Just lots of mosquito bites.', fx: { mood: -5, energy: -5 } }
        ] }
      ]
    },

    /* ---------- สร้างฐาน: ที่พัก / ไฟ ---------- */
    {
      id: 'palms', icon: '🛖', title: 'Pile of Palm Leaves', when: lacks('shelter'), repeat: true, days: [2, 8], weight: 2,
      text: 'Last night, the wind blew a big pile of palm leaves and branches onto the beach. Perfect for building a home!',
      choices: [
        { text: 'Build a hut', outcomes: [
          { text: 'It takes all day, but now you have a hut with a leafy roof. It (almost) keeps the rain out. Home sweet home!', fx: { energy: -25, mood: 12 }, set: { shelter: 1 } }
        ] },
        { text: 'Make a hammock', outcomes: [
          { text: "You relax in your hammock in the sea breeze. Island life isn't so bad!", fx: { energy: 10, mood: 15 } }
        ] },
        { text: 'Use them as firewood', req: has('fire'), lock: NEED_FIRE, outcomes: [
          { text: 'Your fire burns bright all night and keeps the bugs away. You sleep well.', fx: { energy: 12, mood: 8 } }
        ] }
      ]
    },
    {
      id: 'flint', icon: '🪨', title: 'The Spark Stone', when: lacks('fire'), repeat: true, days: [2, 8], weight: 2,
      text: 'You find a shiny black stone. You hit it with another rock... and sparks fly!',
      choices: [
        { text: 'Try to make a fire', outcomes: [
          { p: .7, text: 'You keep trying until your hands hurt. Then a spark lands on a dry coconut husk... FIRE! You made fire!', fx: { energy: -15, mood: 15 }, set: { fire: 1 } },
          { text: 'You try all day. A little smoke, then nothing. Your hands are sore.', fx: { energy: -15, hp: -5, mood: -10 }, cause: 'injury' }
        ] },
        { text: 'Use it to crack open a coconut', outcomes: [
          { text: 'Crack! It opens in one hit. Sweet coconut water and yummy coconut meat!', fx: { food: 12 } }
        ] }
      ]
    },
    {
      id: 'cave', icon: '🕳️', title: 'Mystery Cave', weight: s => s.f.shelter ? .5 : 1.5, days: [3, 9],
      text: 'Behind some bushes, you find a dark cave. Cool air blows out, and you can hear water dripping inside.',
      choices: [
        { text: 'Light a torch and explore', req: has('fire'), lock: NEED_FIRE, outcomes: [
          { p: .6, text: 'Inside is a big room that is dry and warm. It would make a great home!', fx: { energy: -10, mood: 12 }, set: { shelter: 1 } },
          { text: 'The walls are covered in old paintings. They tell the story of someone who was stuck here... and got home safely!', fx: { energy: -10, mood: 20 } }
        ] },
        { text: 'Feel your way in the dark', outcomes: [
          { p: .4, text: 'You feel your way to a big, dry room. It is a perfect place to live!', fx: { energy: -15, mood: 8 }, set: { shelter: 1 } },
          { text: 'Hundreds of bats fly at your face! You bump your head on a rock. Ouch!', fx: { energy: -15, hp: -15, mood: -10 }, cause: 'injury' }
        ] },
        { text: 'Caves are too scary', outcomes: [
          { text: 'You turn around. Better safe than sorry!', fx: { energy: 5 } }
        ] }
      ]
    },

    /* ---------- เส้นทางแพ ---------- */
    {
      id: 'tide', icon: '🐚', title: 'Super Low Tide', when: lacks('wreck'), days: [2, 6], weight: 2.5,
      text: "This morning, the sea went way out. Rocks and sandbars you've never seen before are sticking out of the water.",
      choices: [
        { text: 'Walk far out on the sandbar', outcomes: [
          { p: .6, text: 'At the end of the sandbar is a broken lifeboat! There might be useful things inside. You remember the spot.', fx: { energy: -12, mood: 8 }, set: { wreck: 1 } },
          { text: 'The water comes back fast! You have to swim back to the beach. Phew!', fx: { energy: -20, mood: -5 } }
        ] },
        { text: 'Collect shellfish in rock pools', outcomes: [
          { text: 'The rock pools are full of clams and oysters. You fill a whole basket!', fx: { energy: -8, food: 18 } }
        ] },
        { text: 'Lie in the sun', outcomes: [
          { text: 'You lie in the sun until you are red like a lobster. But you got a good rest.', fx: { energy: 12, mood: 5, hp: -3 } }
        ] }
      ]
    },
    {
      id: 'wreck', icon: '⚓', title: 'The Broken Lifeboat', when: has('wreck'), weight: 3,
      text: 'You go back to the broken lifeboat. It is badly damaged, but some things are still useful. You only have one day before the water comes back.',
      choices: [
        { text: 'Pull off boards for a raft', outcomes: [
          { text: 'The boards are strong. You take a lot of them. Your raft has begun!', fx: { energy: -20, mood: 5 }, add: { raft: 1 } }
        ] },
        { text: 'Search the storage box', outcomes: [
          { p: .65, text: "You find canned food and a pocket knife! On this island, that's better than gold.", fx: { energy: -10, food: 20, mood: 5 }, set: { knife: 1 } },
          { text: "You only find an empty sauce bottle and one old shoe. It's not even your size.", fx: { energy: -10, mood: -8 } }
        ] },
        { text: "Nap in the boat's shade", outcomes: [
          { text: 'The shade is cool and nice. You fall asleep to the sound of the waves.', fx: { energy: 20, mood: 3 } }
        ] }
      ]
    },
    {
      id: 'jungle', icon: '🌴', title: 'Jungle Path', weight: 2,
      text: 'A narrow path goes deep into the jungle. You can hear running water far away.',
      choices: [
        { text: 'Follow the sound of water', outcomes: [
          { p: .7, text: 'A clear waterfall in the jungle! You jump in and splash around until you feel great.', fx: { energy: -10, mood: 20, hp: 10 } },
          { text: 'A green snake bites your ankle! You limp back to camp. Ouch, ouch, ouch!', fx: { energy: -15, hp: -20, mood: -10 }, set: { injured: 1 }, cause: 'injury' }
        ] },
        { text: 'Cut big bamboo for your raft', req: s => (s.f.raft || 0) < 3, lock: RAFT_DONE, outcomes: [
          { text: 'You find giant bamboo. It is perfect for a raft, so you cut lots of it.', fx: { energy: -20, mood: 5 }, add: { raft: 1 } }
        ] },
        { text: 'Too risky. Go back to the beach', outcomes: [
          { text: 'You stay safe, but you still wonder what was in the jungle.', fx: { energy: 10, mood: -5 } }
        ] }
      ]
    },
    {
      id: 'vines', icon: '🌿', title: 'Super Strong Vines', weight: 1.5,
      text: "Long vines hang from the big trees. You pull and pull, but they won't break! They could be really useful.",
      choices: [
        { text: 'Make rope for your raft', outcomes: [
          { text: 'You make a long, strong rope. Perfect for tying a raft together!', fx: { energy: -15, mood: 3 }, add: { raft: 1 } }
        ] },
        { text: 'Make a fishing rod', req: lacks('rod'), lock: 'You already have a fishing rod', outcomes: [
          { text: 'With a thin vine and a sharp fish bone, you make a great fishing rod. Fishing will be easier now!', fx: { energy: -10, mood: 5 }, set: { rod: 1 } }
        ] },
        { text: 'Make a swing', outcomes: [
          { text: 'You swing by the sea in the cool breeze. You laugh out loud for the first time in days!', fx: { mood: 15 } }
        ] }
      ]
    },
    {
      id: 'afterstorm', icon: '🌤️', title: 'After the Storm', when: s => s.used.indexOf('storm') !== -1, days: [5, 9], weight: 3,
      text: 'The storm is over and the sky is bright blue. The waves washed up lots of stuff: wood, plastic boxes, and coconuts!',
      choices: [
        { text: 'Collect wood and boxes for your raft', req: s => (s.f.raft || 0) < 3, lock: RAFT_DONE, outcomes: [
          { text: 'The plastic boxes float really well! Tied to the wood, they make great raft floats.', fx: { energy: -15, mood: 5 }, add: { raft: 1 } }
        ] },
        { text: 'Collect the fallen coconuts', outcomes: [
          { text: 'Coconuts everywhere! You collect enough for many days.', fx: { energy: -8, food: 18 } }
        ] },
        { text: 'Rest after the scary night', outcomes: [
          { text: 'You lie in the warm sun and let your body rest.', fx: { energy: 18, mood: 5 } }
        ] }
      ]
    },
    {
      id: 'driftwood', icon: '🪵', title: 'Floating Log', when: s => (s.f.raft || 0) < 3, repeat: true, weight: s => s.f.raft ? 6 : 2.5,
      text: 'The waves push a big log onto the beach. The wood is still strong, and it floats well.',
      choices: [
        { text: 'Drag it up to build your raft', outcomes: [
          { text: "It's so heavy! But you finally drag it up. Your raft is starting to look like a raft!", fx: { energy: -22, mood: 5 }, add: { raft: 1 } }
        ] },
        { text: 'Chop it into firewood', req: has('fire'), lock: NEED_FIRE, outcomes: [
          { text: 'Your fire burns big and bright all night. You sleep warm and cozy.', fx: { energy: 12, mood: 8 } }
        ] },
        { text: 'Let it float away', outcomes: [
          { text: "The log floats back out to sea... Hope you don't miss it later!", fx: { energy: 5 } }
        ] }
      ]
    },

    /* ---------- เส้นทางสัญญาณ / เรือ ---------- */
    {
      id: 'hill', icon: '⛰️', title: 'Top of the Hill', when: s => (s.f.signal || 0) < 2, repeat: true, days: [3, 9], weight: s => s.f.signal ? 4 : 2,
      text: 'You climb to the top of the tallest hill. You can see the ocean all around you. If a ship comes, this is the best place to be seen!',
      choices: [
        { text: 'Build a big signal fire', req: has('fire'), lock: NEED_FIRE, outcomes: [
          { text: "You pile up branches taller than you. You'll light it when you see a ship. Every ship will see it!", fx: { energy: -25, mood: 10 }, set: { signal: 2 } }
        ] },
        { text: 'Make a big S.O.S. with rocks', outcomes: [
          { text: 'Giant S.O.S. letters on the rocks. Anyone passing by will see them... hopefully!', fx: { energy: -20, mood: 5 }, add: { signal: 1 } }
        ] },
        { text: 'Watch the sunset', outcomes: [
          { text: "The sky turns orange and pink. It's so pretty that you forget you're stuck on an island.", fx: { mood: 15, energy: 5 } }
        ] }
      ]
    },
    {
      id: 'bottle', icon: '🍾', title: 'Message in a Bottle', days: [2, 8], weight: 1.5,
      text: 'A glass bottle floats up to your feet. Inside is an old, rolled-up piece of paper.',
      choices: [
        { text: 'Open it and read the paper', outcomes: [
          { text: "It's a treasure map! A red X marks a giant tree in the north of the island.", fx: { mood: 12 }, set: { map: 1 } }
        ] },
        { text: 'Toss the paper and send your own S.O.S.', outcomes: [
          { text: "You throw the bottle as far as you can. Please, someone find it! (That old paper probably wasn't important... right?)", fx: { mood: 8 }, add: { signal: 1 } }
        ] }
      ]
    },
    {
      id: 'farship', icon: '🚢', title: 'A Dot Far Away', when: lacks('signal'), days: [5, 8], weight: 2,
      text: "You squint at the edge of the sea... It's a ship! But it's very, very far away.",
      choices: [
        { text: 'Shout and wave your shirt', outcomes: [
          { text: "The ship just sails away. It's like you're invisible... A better signal would really help.", fx: { mood: -15 } }
        ] },
        { text: 'Quickly make an S.O.S. for next time', outcomes: [
          { text: 'Too late for this ship, but the next one will see it! Now there is a giant S.O.S. on the beach.', fx: { energy: -20, mood: 5 }, add: { signal: 1 } }
        ] }
      ]
    },
    {
      id: 'footprint', icon: '👣', title: 'Mystery Footprints', days: [5, 9], weight: 1,
      text: "There are footprints in the sand going toward the rocks... They aren't yours! Or are they?",
      choices: [
        { text: 'Follow the footprints', outcomes: [
          { p: .5, text: "You find an old explorer's camp! There's canned food and a signal flare.", fx: { energy: -12, food: 20, mood: 10 }, add: { signal: 1 } },
          { text: 'You walk in circles until you realize... these are your own footprints from yesterday.', fx: { energy: -12, mood: -10 } }
        ] },
        { text: 'Hide and watch quietly', outcomes: [
          { text: 'You hide in a bush until your leg cramps. Nobody shows up.', fx: { mood: -8 } }
        ] }
      ]
    },

    /* ---------- เส้นทางลับ: สมบัติ / ลิง / วิลสัน ---------- */
    {
      id: 'dig', icon: '🗺️', title: 'The Giant Tree', when: s => s.f.map && !s.f.treasure, days: [3, 9], weight: 3,
      text: 'You follow the map to a giant tree. Its roots spread out like octopus arms. The X is on a patch of soft dirt.',
      choices: [
        { text: 'Dig! Dig! Dig!', outcomes: [
          { p: .75, text: "Thunk! You hit an old wooden chest. It's full of gold coins and jewels! ...But you can't eat gold.", fx: { energy: -25, mood: 25 }, set: { treasure: 1 } },
          { text: 'You dig a deep hole and find... a red ant nest! You run and jump into the sea. (Maybe you dug in the wrong spot?)', fx: { energy: -25, hp: -10, mood: -10 }, cause: 'injury', keep: true }
        ] },
        { text: 'Too tired today. Come back later', outcomes: [
          { text: 'You remember the spot and go back to rest.', fx: { energy: 10 }, keep: true }
        ] }
      ]
    },
    {
      id: 'monkey1', icon: '🐒', title: 'Hungry Little Monkey', days: [2, 7], weight: 1.5,
      text: 'A little monkey stares at your food with big, round eyes. Its tummy growls even louder than yours!',
      choices: [
        { text: 'Share half your food', req: s => s.food >= 10, lock: '🍖 Not enough food to share', outcomes: [
          { text: 'The little monkey munches happily, then leans on your shoulder. You made a new friend!', fx: { food: -10, mood: 12 }, set: { monkey: 1 } }
        ] },
        { text: 'Shoo it away', outcomes: [
          { p: .6, text: 'The little monkey runs into the jungle. You feel a bit bad.', fx: { mood: -5 } },
          { text: 'It shows its teeth, then grabs your bananas and runs!', fx: { food: -12, mood: -8 } }
        ] }
      ]
    },
    {
      id: 'monkey2', icon: '🙈', title: 'The Monkey Comes Back', when: s => s.f.monkey === 1, days: [4, 9], weight: 3,
      text: 'The little monkey is back, and it brought lots of friends! It pulls on your shirt and points to the hill.',
      choices: [
        { text: 'Follow the little monkey', outcomes: [
          { text: "The monkeys lead you to a huge banana grove! The boss monkey nods at you. You're part of the gang now!", fx: { energy: -10, food: 25, mood: 15 }, add: { monkey: 1 } }
        ] },
        { text: 'Shake your head. Not today', outcomes: [
          { text: 'The monkeys look sad and go back into the jungle.', fx: { mood: -5 } }
        ] }
      ]
    },
    {
      id: 'wilson', icon: '🥥', title: 'Wilson Wants to Talk', when: has('wilson'), days: [3, 9], weight: 2,
      text: 'It is a quiet night. You feel like Wilson is looking at you, trying to say something...',
      choices: [
        { text: 'Talk with Wilson all night', outcomes: [
          { text: 'You tell Wilson your whole life story until the sun comes up. Wilson is the best listener ever!', fx: { mood: 20, energy: -10 } }
        ] },
        { text: "Wilson... you're just a coconut", outcomes: [
          { text: 'You crack Wilson open and drink the coconut water. It is sweet, but now you feel lonely. Goodbye, old friend.', fx: { food: 12, mood: -15 }, set: { wilson: 0 } }
        ] }
      ]
    },
    {
      id: 'turtle', icon: '🐢', title: 'Sea Turtle Eggs', days: [3, 9], weight: 1,
      text: 'Late at night, a big sea turtle crawls up the beach and lays her eggs. There are about a hundred round, white eggs!',
      choices: [
        { text: 'Take the eggs to eat', outcomes: [
          { text: "Your tummy is full, but you can't forget the mother turtle's eyes as she went back to the sea.", fx: { food: 22, mood: -12 } }
        ] },
        { text: 'Guard the nest', outcomes: [
          { text: 'You chase the seagulls away all night. In the morning, tiny baby turtles crawl into the sea. Your heart feels warm!', fx: { mood: 22, energy: -10 }, set: { karma: 1 } }
        ] }
      ]
    },

    /* ---------- อันตราย ---------- */
    {
      id: 'storm', icon: '⛈️', title: 'A Big Storm Is Coming!', weather: 'storm', days: [4, 8], weight: 4,
      text: 'The sky turns dark in the middle of the day. The wind bends the palm trees. Lightning hits the sea. A huge storm is coming!',
      choices: [
        { text: 'Hide in your hut', req: has('shelter'), lock: NEED_HUT, outcomes: [
          { text: "Your hut shakes, but it doesn't fall down. You wait until the storm is over. Good thing you built it!", fx: { energy: -5, mood: -3 } }
        ] },
        { text: 'Climb up to a cave on the hill', outcomes: [
          { p: .7, text: 'You push through the wind and rain and reach the cave just in time. Wet, but safe!', fx: { energy: -20, mood: -5 } },
          { text: 'The path is very slippery. You slide down the hill and scrape your knee. Ouch!', fx: { energy: -20, hp: -18, mood: -10 }, set: { injured: 1 }, cause: 'injury' }
        ] },
        { text: 'Hug a palm tree and hope', outcomes: [
          { p: .5, text: "You hug the tree all night. The wind is so strong! You're hurt, but you made it.", fx: { hp: -20, mood: -10 }, cause: 'injury' },
          { text: 'Two coconuts fall on your head... Ouch! But hey, free snacks.', fx: { hp: -12, food: 12, mood: -5 }, cause: 'injury' }
        ] }
      ]
    },
    {
      id: 'shark', icon: '🦈', title: 'A Fin in the Water', days: [3, 9], weight: 1.5,
      text: 'You are looking for shells in the shallow water when you see a gray fin. It is swimming closer and closer!',
      choices: [
        { text: 'Run to the beach as fast as you can', outcomes: [
          { p: .8, text: 'You run faster than ever! You reach the beach out of breath, but safe.', fx: { energy: -15, mood: -5 } },
          { text: 'You trip on a rock! The shark nips your leg before you get away!', fx: { energy: -15, hp: -22, mood: -10 }, set: { injured: 1 }, cause: 'injury' }
        ] },
        { text: 'Use your knife to fight!', req: has('knife'), lock: 'Need a 🔪 Pocket Knife', outcomes: [
          { p: .6, text: 'You fight bravely and the shark swims away. You even catch the big fish it was chasing. Huge dinner!', fx: { energy: -20, food: 35, mood: 20 } },
          { text: 'The shark is stronger than you thought. You get a long cut on your arm.', fx: { energy: -20, hp: -30, mood: -10 }, set: { injured: 1 }, cause: 'injury' }
        ] },
        { text: 'Stand still like a rock', outcomes: [
          { p: .5, text: 'It swims up, sniffs... and swims away. It was just a playful dolphin!', fx: { mood: 10 } },
          { text: "A rock with legs doesn't fool anyone. It bites your leg!", fx: { hp: -28, mood: -15 }, set: { injured: 1 }, cause: 'injury' }
        ] }
      ]
    },
    {
      id: 'fever', icon: '🤒', title: 'Sudden Fever', when: s => !s.f.shelter || s.mood < 40, days: [4, 9], weight: 1.5,
      text: 'You wake up feeling hot and dizzy. Sleeping on the ground is making you sick.',
      choices: [
        { text: 'Stay in bed all day', outcomes: [
          { text: 'You sweat all day. By evening, the fever starts to go down.', fx: { energy: 10, hp: -5, food: -5 } }
        ] },
        { text: 'Look for food anyway', outcomes: [
          { text: 'You find a little fruit, but you feel even worse.', fx: { energy: -20, food: 12, hp: -12 }, cause: 'injury' }
        ] },
        { text: 'Drink hot water and rest', req: has('fire'), lock: NEED_FIRE, outcomes: [
          { text: 'The warm water helps a lot. You sweat out the fever and wake up feeling good.', fx: { hp: 5, energy: 5 } }
        ] }
      ]
    },
    {
      id: 'herbs', icon: '🌱', title: 'Wild Herbs', when: s => s.f.injured || s.hp < 60, repeat: true, weight: s => s.f.injured ? 4 : 1.5,
      text: 'You find a plant with pointy leaves and a strong smell. It looks like a healing plant you once saw on TV.',
      choices: [
        { text: 'Boil it into medicine', req: has('fire'), lock: NEED_FIRE, outcomes: [
          { text: 'It tastes super bitter, but you feel better right away. Your wound is healing!', fx: { hp: 20, mood: 5 }, set: { injured: 0 } }
        ] },
        { text: 'Rub the leaves on your wound', outcomes: [
          { p: .7, text: 'Cool and tingly. It really works! You feel much better.', fx: { hp: 12 }, set: { injured: 0 } },
          { text: "Itchy red bumps all over your arm... That wasn't a healing plant. It was poison ivy!", fx: { hp: -5, mood: -10 }, cause: 'injury' }
        ] },
        { text: 'Too risky. Leave it', outcomes: [
          { text: "You walk away, still not sure if it would've worked.", fx: { mood: -3 } }
        ] }
      ]
    },

    /* ---------- วันที่ 10 (บังคับ) ---------- */
    {
      id: 'finale', icon: '🌅', title: 'Day 10!', days: [10, 10],
      text: 'It is the morning of Day 10. You made it further than anyone thought! The sea breeze feels different today... It is time for your final choice.',
      choices: [
        { text: 'Signal a ship', req: has('signal'), lock: 'Need an 🆘 S.O.S. signal', outcomes: [
          { p: s => Math.min(1, (s.f.signal >= 2 ? 1 : .6) + (s.f.karma ? .15 : 0)),
            text: 'HONK HONK! A big fishing boat sees your signal and sails straight toward you!',
            end: s => s.f.treasure ? 'rich' : 'rescue' },
          { text: 'You wait all day until sunset... No ships come. Looks like this island will be your home for a while.', end: stayEnding }
        ] },
        { text: 'Sail away on your raft', req: has('raft', 3), lock: s => `Need 3 🛶 raft pieces (you have ${s.f.raft || 0})`, outcomes: [
          { p: s => clamp(.35 + s.food / 200 + s.energy / 200 + (s.f.nav ? .2 : 0) + (s.f.karma ? .1 : 0), .15, .95),
            text: 'You paddle through wave after wave after wave... until you see land!',
            end: s => s.f.treasure ? 'rich' : 'raft' },
          { text: 'Your raft drifts farther and farther away... too far to turn back.', end: 'lostsea' }
        ] },
        { text: 'Stay and live on the island', outcomes: [
          { text: 'You look out at the big ocean. Then you look back at the island that has been your home for ten days...', end: stayEnding }
        ] }
      ]
    }
  ];
})(globalThis);
