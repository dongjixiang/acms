// ACMS · 知名 IP 词典（v0.22.31，2026-06-30）
//   解决"用户输入 IP 名 → 生成的角色图偏离用户预期"问题
//
// 用法：
//   const ip = ACMSScreenplayIPDict.lookup('擎天柱');
//   if (ip) {
//     // ip = { key, nameEn, visualKeywords, styleHint }
//     // 在 prompt 里加：ip.nameEn + ip.visualKeywords
//   }
//
// 维护规则：
//   1. 只收录"用户口头提到就能立刻联想到具体视觉"的 IP
//   2. 中文名/英文名/常见昵称都要能匹配
//   3. visualKeywords 用 SDXL/Flux/Agnes image-2.0-flash 能理解的英文描述
//   4. styleHint 默认 'photorealistic'，特殊风格（G1 动画/水墨）才填

(function () {
  const IP_TABLE = [
    // ===== 变形金刚 =====
    {
      keys: ['擎天柱', '柯博文', 'Optimus', 'Optimus Prime', 'optprime'],
      key: 'transformers_g1',
      nameEn: 'Optimus Prime (Transformers Generation 1, 1984)',
      visualKeywords: 'classic G1 animated character, red and blue color scheme, semi-truck cab chest, iconic helmet with antennae, mouthplate, leader of Autobots, heroic stance, no realistic mech reinterpretation',
      styleHint: 'photorealistic',
    },
    {
      keys: ['威震天', '密卡登', 'Megatron'],
      key: 'transformers_g1',
      nameEn: 'Megatron (Transformers Generation 1, 1984)',
      visualKeywords: 'classic G1 animated character, silver and purple/grey color scheme, fusion cannon for arm, tank treads, Decepticon leader, menacing villain stance, angular helmet, no realistic mech reinterpretation',
      styleHint: 'photorealistic',
    },
    {
      keys: ['大黄蜂', 'Bumblebee'],
      key: 'transformers_g1',
      nameEn: 'Bumblebee (Transformers Generation 1, 1984)',
      visualKeywords: 'classic G1 animated character, yellow and black color scheme, small Volkswagen Beetle alt mode, friendly scout, visor eyes, no realistic mech reinterpretation',
      styleHint: 'photorealistic',
    },

    // ===== DC 漫画 =====
    {
      keys: ['超人', 'Superman', '克拉克', 'Clark Kent', 'Kal-El'],
      key: 'dc_superman',
      nameEn: 'Superman (DC Comics)',
      visualKeywords: 'classic superhero, blue suit with red cape, iconic red and yellow S shield on chest, red boots, spit-curl hair, strong muscular build, clean shaven, heroic pose',
      styleHint: 'photorealistic',
    },
    {
      keys: ['蝙蝠侠', 'Batman', '布鲁斯', 'Bruce Wayne'],
      key: 'dc_batman',
      nameEn: 'Batman (DC Comics)',
      visualKeywords: 'classic superhero, dark grey and black suit, yellow bat symbol on chest, scalloped cape, pointed cowl with short ears, muscular, brooding dark vigilante',
      styleHint: 'photorealistic',
    },
    {
      keys: ['小丑', 'Joker'],
      key: 'dc_joker',
      nameEn: 'Joker (DC Comics)',
      visualKeywords: 'iconic comic villain, white face paint, green hair, red lips, purple suit, permanent grin, clown-like makeup, chaotic appearance',
      styleHint: 'photorealistic',
    },
    {
      keys: ['神奇女侠', 'Wonder Woman', '戴安娜'],
      key: 'dc_wonderwoman',
      nameEn: 'Wonder Woman (DC Comics)',
      visualKeywords: 'classic superhero, red and gold bustier with eagle emblem, blue star-spangled shorts, silver bracelets, tiara, lasso of truth, Amazonian warrior princess',
      styleHint: 'photorealistic',
    },

    // ===== 漫威 =====
    {
      keys: ['蜘蛛侠', 'Spider-Man', '彼得帕克', 'Peter Parker'],
      key: 'marvel_spiderman',
      nameEn: 'Spider-Man (Marvel Comics)',
      visualKeywords: 'classic superhero, full body red and blue suit, black spider emblem on chest, web pattern, large white eye lenses on mask, agile athletic build',
      styleHint: 'photorealistic',
    },
    {
      keys: ['钢铁侠', 'Iron Man', '托尼', 'Tony Stark'],
      key: 'marvel_ironman',
      nameEn: 'Iron Man (Marvel Comics)',
      visualKeywords: 'classic superhero, sleek red and gold mechanical armor, arc reactor glowing on chest, face plate helmet with glowing eyes, repulsor gauntlets, high-tech sophisticated design',
      styleHint: 'photorealistic',
    },
    {
      keys: ['美国队长', 'Captain America', '史蒂夫', 'Steve Rogers'],
      key: 'marvel_captain',
      nameEn: 'Captain America (Marvel Comics)',
      visualKeywords: 'classic superhero, star-spangled blue white and red suit, white star on chest, red white blue circular shield, winged helmet, muscular patriotic soldier',
      styleHint: 'photorealistic',
    },
    {
      keys: ['雷神', 'Thor'],
      key: 'marvel_thor',
      nameEn: 'Thor (Marvel Comics)',
      visualKeywords: 'classic superhero, Norse god appearance, long blonde hair, winged silver helmet, red cape, silver chest armor, muscular warrior, holding Mjolnir hammer',
      styleHint: 'photorealistic',
    },
    {
      keys: ['绿巨人', 'Hulk', '浩克', '班纳', 'Bruce Banner'],
      key: 'marvel_hulk',
      nameEn: 'Hulk (Marvel Comics)',
      visualKeywords: 'classic superhero, enormous green-skinned muscular giant, torn purple pants, angry expression, massive physique, no shirt',
      styleHint: 'photorealistic',
    },
    {
      keys: ['黑寡妇', 'Black Widow', '娜塔莎', 'Natasha'],
      key: 'marvel_blackwidow',
      nameEn: 'Black Widow (Marvel Comics)',
      visualKeywords: 'classic superhero, sleek black tactical bodysuit, red hourglass symbol on belt, red hair in braid, spy weapons, athletic female build',
      styleHint: 'photorealistic',
    },
    {
      keys: ['金刚狼', 'Wolverine', 'Logan', '罗根'],
      key: 'marvel_wolverine',
      nameEn: 'Wolverine (Marvel Comics)',
      visualKeywords: 'classic superhero, yellow and blue costume or brown leather jacket, mutton chop sideburns, adamantium claws extended from fists, muscular short stature, angry snarl',
      styleHint: 'photorealistic',
    },

    // ===== 哈利波特 =====
    {
      keys: ['哈利波特', 'Harry Potter', '霍格沃茨', 'Hogwarts', '霍格沃茨魔法大厅', '霍格沃茨城堡', '对角巷', 'Diagon Alley', '九又四分之三站台', 'Platform 9 3/4'],
      key: 'hp_harry',
      nameEn: 'Harry Potter / Hogwarts (Wizarding World)',
      visualKeywords: 'young wizard boy, round glasses, lightning bolt scar on forehead, messy black hair, Hogwarts school robes, Gryffindor red and gold scarf, magical castle setting with floating candles, stone corridors, wizarding aesthetic',
      styleHint: 'photorealistic',
    },
    {
      keys: ['赫敏', 'Hermione'],
      key: 'hp_hermione',
      nameEn: 'Hermione Granger (Wizarding World)',
      visualKeywords: 'young witch, bushy brown curly hair, Hogwarts school robes, Gryffindor red and gold scarf, intelligent expression, holding wand',
      styleHint: 'photorealistic',
    },
    {
      keys: ['邓布利多', 'Dumbledore'],
      key: 'hp_dumbledore',
      nameEn: 'Albus Dumbledore (Wizarding World)',
      visualKeywords: 'elderly wizard, long silver beard, half-moon glasses, purple robes with stars, long silver hair, wise gentle expression',
      styleHint: 'photorealistic',
    },

    // ===== 指环王 =====
    {
      keys: ['甘道夫', 'Gandalf', '中土', 'Middle-earth', '魔多', 'Mordor', '瑞文戴尔', 'Rivendell', '刚铎', 'Gondor'],
      key: 'lotr_gandalf',
      nameEn: 'Lord of the Rings / Middle-earth',
      visualKeywords: 'Tolkien fantasy aesthetic, medieval fantasy setting, ancient stone castles, rolling green hills, dramatic mountain landscapes, epic high fantasy atmosphere, weathered medieval warriors and wizards',
      styleHint: 'photorealistic',
    },
    {
      keys: ['佛罗多', 'Frodo', '霍比特人', 'Hobbit', '夏尔', 'Shire'],
      key: 'lotr_frodo',
      nameEn: 'Frodo Baggins / Shire (Lord of the Rings)',
      visualKeywords: 'young hobbit, curly brown hair, large furry feet, simple green and brown hobbit clothes, innocent expression, small stature with hairy feet visible, idyllic Shire village setting with round green doors',
      styleHint: 'photorealistic',
    },
    {
      keys: ['阿拉贡', 'Aragorn'],
      key: 'lotr_aragorn',
      nameEn: 'Aragorn (Lord of the Rings)',
      visualKeywords: 'ranger warrior, rugged dark hair, weathered face, ranger garb with leather, Anduril sword, stern heroic expression',
      styleHint: 'photorealistic',
    },

    // ===== 加勒比海盗 =====
    {
      keys: ['杰克船长', 'Jack Sparrow', '杰克'],
      key: 'pircaribbean_jack',
      nameEn: 'Captain Jack Sparrow (Pirates of the Caribbean)',
      visualKeywords: 'eccentric pirate captain, dreadlocked black hair with beads, smudged kohl eyeliner, tricorn hat, weathered leather coat, bandana, pirate accessories',
      styleHint: 'photorealistic',
    },

    // ===== 宝可梦 =====
    {
      keys: ['皮卡丘', 'Pikachu'],
      key: 'pokemon_pikachu',
      nameEn: 'Pikachu (Pokemon)',
      visualKeywords: 'iconic Pokemon creature, yellow rodent body, long pointed ears with black tips, red cheek circles, lightning bolt shaped tail, cute chubby cheeks, small stature',
      styleHint: 'photorealistic',
    },
    {
      keys: ['喷火龙', 'Charizard'],
      key: 'pokemon_charizard',
      nameEn: 'Charizard (Pokemon)',
      visualKeywords: 'iconic Pokemon creature, large orange dragon, blue-green wings with flame at wingtip, cream colored belly, flame at tail tip, powerful stance',
      styleHint: 'photorealistic',
    },

    // ===== 海贼王 =====
    {
      keys: ['路飞', 'Luffy', '蒙奇'],
      key: 'op_luffy',
      nameEn: 'Monkey D. Luffy (One Piece)',
      visualKeywords: 'anime character young pirate, straw hat, red open vest, blue shorts, sandals, scar under left eye, determined grin, stretchy rubber body',
      styleHint: 'anime',
    },
    {
      keys: ['索隆', 'Zoro', '罗罗诺亚'],
      key: 'op_zoro',
      nameEn: 'Roronoa Zoro (One Piece)',
      visualKeywords: 'anime character green-haired swordsman, three swords, bandana, white shirt, black hakama pants, earring, muscular scarred body',
      styleHint: 'anime',
    },
    {
      keys: ['娜美', 'Nami'],
      key: 'op_nami',
      nameEn: 'Nami (One Piece)',
      visualKeywords: 'anime character orange-haired navigator, tattoo on left shoulder, blue and white striped bikini top, denim shorts, slim thief build',
      styleHint: 'anime',
    },

    // ===== 火影忍者 =====
    {
      keys: ['鸣人', 'Naruto', '漩涡'],
      key: 'naruto_naruto',
      nameEn: 'Naruto Uzumaki (Naruto)',
      visualKeywords: 'anime character blonde spiky hair, whisker marks on cheeks, blue eyes, orange and black jumpsuit, headband with leaf symbol, energetic ninja',
      styleHint: 'anime',
    },
    {
      keys: ['佐助', 'Sasuke', '宇智波'],
      key: 'naruto_sasuke',
      nameEn: 'Sasuke Uchiha (Naruto)',
      visualKeywords: 'anime character black spiky hair, dark eyes, blue high-collared shirt, white pants, headband with leaf symbol, brooding avenger',
      styleHint: 'anime',
    },
    {
      keys: ['卡卡西', 'Kakashi'],
      key: 'naruto_kakashi',
      nameEn: 'Kakashi Hatake (Naruto)',
      visualKeywords: 'anime character silver hair, mask covering lower face, left eye covered, headband tilted to cover eye, jonin flak jacket, copy ninja',
      styleHint: 'anime',
    },

    // ===== 柯南 =====
    {
      keys: ['柯南', 'Conan', '工藤新一', '江戸川コナン'],
      key: 'conan_edogawa',
      nameEn: 'Conan Edogawa (Detective Conan)',
      visualKeywords: 'anime character young detective boy, large round glasses, blue bow tie, grey school uniform jacket, red bow, child-sized body',
      styleHint: 'anime',
    },

    // ===== 灌篮高手 =====
    {
      keys: ['樱木花道', 'Sakuragi'],
      key: 'slamdunk_sakuragi',
      nameEn: 'Hanamichi Sakuragi (Slam Dunk)',
      visualKeywords: 'anime character red-haired basketball player, tall muscular teen, white Shohoku jersey number 10, red hair, confident grin',
      styleHint: 'anime',
    },
    {
      keys: ['流川枫', 'Rukawa'],
      key: 'slamdunk_rukawa',
      nameEn: 'Kaede Rukawa (Slam Dunk)',
      visualKeywords: 'anime character cool basketball player, dark blue/black hair, calm expression, white Shohoku jersey number 11, talented forward',
      styleHint: 'anime',
    },

    // ===== 鬼灭之刃 =====
    {
      keys: ['炭治郎', 'Tanjiro', '灶门'],
      key: 'kimetsu_tanjiro',
      nameEn: 'Tanjiro Kamado (Demon Slayer)',
      visualKeywords: 'anime character young demon slayer, red and black checkered haori, burgundy hair, gentle expression, hanafuda earrings, katana',
      styleHint: 'anime',
    },

    // ===== 加勒比海盗 =====
    {
      keys: ['杰克船长', 'Jack Sparrow', '杰克'],
      key: 'pircaribbean_jack',
      nameEn: 'Captain Jack Sparrow (Pirates of the Caribbean)',
      visualKeywords: 'eccentric pirate captain, dreadlocked black hair with beads, smudged kohl eyeliner, tricorn hat, weathered leather coat, bandana, pirate accessories',
      styleHint: 'photorealistic',
    },

    // ===== 三体（中国科幻）=====
    {
      keys: ['三体', 'Three Body'],
      key: 'threebody',
      nameEn: 'Three-Body Problem character (Chinese sci-fi)',
      visualKeywords: 'Chinese sci-fi character, contemporary Chinese realistic appearance, 2000s era clothing, intellectual or scientist look',
      styleHint: 'photorealistic',
    },
    {
      keys: ['流浪地球', 'Wandering Earth'],
      key: 'wanderingearth',
      nameEn: 'Wandering Earth character (Chinese sci-fi)',
      visualKeywords: 'Chinese sci-fi character in heavy mechanical exoskeleton, futuristic Chinese space military uniform, helmet with HUD display',
      styleHint: 'photorealistic',
    },

    // ===== 中国古装（甄嬛传等）=====
    {
      keys: ['甄嬛', '熹贵妃'],
      key: 'zhenhuan',
      nameEn: 'Zhen Huan (Chinese Qing Dynasty period drama)',
      visualKeywords: 'Chinese Qing Dynasty court lady, elaborate silk hanfu with floral embroidery, traditional Manchu hairstyle with butterfly ornaments, elegant delicate features, palace setting attire',
      styleHint: 'photorealistic',
    },
    {
      keys: ['如懿', '娴妃'],
      key: 'ruyi',
      nameEn: 'Ru Yi (Chinese Qing Dynasty period drama)',
      visualKeywords: 'Chinese Qing Dynasty court lady, elaborate Qing dynasty hanfu with phoenix embroidery, traditional Manchu hairstyle with floral headpieces, refined noble features',
      styleHint: 'photorealistic',
    },

    // ===== 中国武侠 =====
    {
      keys: ['小龙女', 'Xiaolongnu'],
      key: 'xiaolongnu',
      nameEn: 'Xiao Long Nu (Chinese wuxia classic)',
      visualKeywords: 'Chinese ancient wuxia heroine, flowing white silk hanfu, long black hair, ethereal otherworldly beauty, classical Chinese beauty, cold demeanor, sword',
      styleHint: 'photorealistic',
    },
    {
      keys: ['黄蓉', 'Huang Rong'],
      key: 'huangrong',
      nameEn: 'Huang Rong (Chinese wuxia classic)',
      visualKeywords: 'clever Chinese wuxia heroine, yellow silk hanfu, mischievous intelligent expression, hair tied in braids, ancient Chinese archery, charming beauty',
      styleHint: 'photorealistic',
    },
  ];

  /**
   * 查找 IP（name 包含任意 keys 子串即匹配）
   *   lookup('擎天柱大战威震天') → 第一个匹配（擎天柱）
   *   lookup('威震天') → Megatron
   *   lookup('超人总动员') → null（"超人总动员" 不是 Superman）
   *
   * 重要：按 keys 长度倒序匹配长的，避免短前缀误匹配（如"超" 误匹配"超人"）
   */
  function lookupIP(name) {
    if (!name || typeof name !== 'string') return null;
    const lowered = name.toLowerCase();

    // 把所有 keys 拍平为 [(key, ipEntry)]，按 key 长度倒序
    const allKeys = [];
    for (const entry of IP_TABLE) {
      for (const k of entry.keys) {
        allKeys.push({ key: k, entry, klen: k.length });
      }
    }
    allKeys.sort((a, b) => b.klen - a.klen);

    for (const { key, entry } of allKeys) {
      if (lowered.includes(key.toLowerCase())) {
        return {
          key: entry.key,
          nameEn: entry.nameEn,
          visualKeywords: entry.visualKeywords,
          styleHint: entry.styleHint,
          matchedKey: key,
        };
      }
    }
    return null;
  }

  /**
   * 在文本中查找所有 IP（用于多角色/场景描述里检测）
   *   lookupAllIPs('擎天柱大战威震天') → [Optimus, Megatron]
   */
  function lookupAllIPs(text) {
    if (!text || typeof text !== 'string') return [];
    const found = new Map();  // key → ip（去重）
    const lowered = text.toLowerCase();

    const allKeys = [];
    for (const entry of IP_TABLE) {
      for (const k of entry.keys) {
        allKeys.push({ key: k, entry });
      }
    }
    allKeys.sort((a, b) => b.key.length - a.key.length);

    for (const { key, entry } of allKeys) {
      if (lowered.includes(key.toLowerCase()) && !found.has(entry.key)) {
        found.set(entry.key, {
          key: entry.key,
          nameEn: entry.nameEn,
          visualKeywords: entry.visualKeywords,
          styleHint: entry.styleHint,
          matchedKey: key,
        });
      }
    }
    return Array.from(found.values());
  }

  /**
   * 风格锚定模板（每种 art_style 对应的 prompt 片段）
   *   放在 Style 字段最前面 + Negative 字段最前面，强制硬约束
   */
  const STYLE_TEMPLATES = {
    photorealistic: {
      stylePrefix: 'STRICTLY photorealistic, real human photography, MUST NOT be cartoon, anime, illustration, 3D render, chibi, sketch, painting, drawing.',
      styleSuffix: 'cinematic photorealistic portrait, real photography, DSLR quality.',
      negativePrefix: 'STRICTLY FORBIDDEN: cartoon, anime, illustration, 3D render, chibi, sketch, painting, drawing, comic. Required: photorealistic photography only.',
    },
    '3d-render': {
      stylePrefix: 'STRICTLY 3D rendered (Pixar/Disney style), MUST be CGI animation style, MUST NOT be 2D anime, real photo, traditional 2D cartoon.',
      styleSuffix: 'high quality 3D CGI render, Pixar Disney animation style, volumetric lighting.',
      negativePrefix: 'STRICTLY FORBIDDEN: 2D anime, real photo, traditional cartoon, sketch, drawing. Required: 3D CGI render only.',
    },
    g1_animation: {
      stylePrefix: 'STRICTLY classic 1980s-90s Saturday morning cartoon style (like Transformers G1, Thundercats, He-Man animation), cel-shaded, flat colors, thick outlines.',
      styleSuffix: 'classic 80s 90s cartoon aesthetic, cel-shaded animation, bold outlines.',
      negativePrefix: 'STRICTLY FORBIDDEN: photorealistic, 3D render, modern anime, live action. Required: classic 80s 90s cel-shaded cartoon only.',
    },
    anime: {
      stylePrefix: 'STRICTLY modern Japanese anime style (cel-shaded, large eyes, vibrant colors), MUST NOT be photorealistic, 3D render, Disney style.',
      styleSuffix: 'modern Japanese anime aesthetic, cel-shaded, vibrant saturated colors, expressive anime eyes.',
      negativePrefix: 'STRICTLY FORBIDDEN: photorealistic, real photo, 3D Pixar, Disney Western cartoon, sketch. Required: Japanese anime style only.',
    },
    guofeng: {
      stylePrefix: 'STRICTLY traditional Chinese guofeng ink painting style (水墨国风), brush stroke textures, traditional aesthetics.',
      styleSuffix: 'Chinese ink painting aesthetic, traditional guofeng style, flowing brush strokes, classical Chinese art.',
      negativePrefix: 'STRICTLY FORBIDDEN: photorealistic, anime, modern cartoon, 3D render, Western illustration. Required: Chinese ink painting guofeng only.',
    },
  };

  /**
   * 获取风格模板（找不到则回退 photorealistic）
   */
  function getStyleTemplate(artStyle) {
    return STYLE_TEMPLATES[artStyle] || STYLE_TEMPLATES.photorealistic;
  }

  /**
   * 列出所有可用风格（给前端下拉框用）
   */
  function listArtStyles() {
    return [
      { value: 'photorealistic', label: '📸 写实摄影（默认）' },
      { value: '3d-render', label: '🎬 3D 渲染（Pixar/Disney）' },
      { value: 'g1_animation', label: '📺 G1 经典动画（80/90s 卡通）' },
      { value: 'anime', label: '✨ 日漫风' },
      { value: 'guofeng', label: '🖌️ 国风水墨' },
    ];
  }

  window.ACMSScreenplayIPDict = {
    lookup: lookupIP,
    lookupAll: lookupAllIPs,
    getStyleTemplate,
    listArtStyles,
    IP_TABLE,  // 测试用
  };
})();