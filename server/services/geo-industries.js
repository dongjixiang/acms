// ACMS GEO — 行业分类（v0.48 引入国标）
// 路径：server/services/geo-industries.js
//
// 数据来源：GB/T 4754-2017《国民经济行业分类》— 国家标准（含修订单）
//   - 门类 20 个（A-T 大写字母）
//   - 大类 95 个（按 GB/T 2017 实测）
//   - 中类 524 项（实测数据 — 从多多提供的官方 PDF 抽取）
//   - 小类 1380+ 个（不在本文件）
//
// PDF 抽取说明（v0.48）：
//   - 多多下载了国标全文 PDF（D:\Users\swede\Downloads\GBT+4754-2017.pdf）
//   - 用 pymupdf 抽文本，处理了 PDF 字体编码 bug（code 重复显示）
//   - 524 条中类覆盖全部 96 个大类（GB/T 2017 含修订单的 82/97-99 大类也覆盖）
//
// 选用中类粒度的理由（多多 v0.48 拍板）：
//   - 大类太粗：「零售业」下沃尔玛和 7-11 在一起对比无效
//   - 小类太细：样本不够做行业对比
//   - 中类 524 项是国标常用的「行业对比」粒度
//
// 设计：
//   - code 是中类代码 3 位数字（"601" 邮政基本服务）
//   - code 前 1 位对应门类（6 = G 交通运输、仓储和邮政业）
//   - code 前 2 位对应大类（60 = 邮政业）
//   - category 是门类（含字母）
//   - major 是大类（code + 名称）
//   - label 是中类中文标准名
//   - 历史 slug → 中类 code 通过 LEGACY_SLUG_TO_CODE 映射（旧数据展示兼容）

const MID_CATEGORIES = [
  { code: '011', category: 'A 农、林、牧、渔业', major: '01 农业', label: '谷物种植' },
  { code: '012', category: 'A 农、林、牧、渔业', major: '01 农业', label: '豆类、油料和薯类种植' },
  { code: '013', category: 'A 农、林、牧、渔业', major: '01 农业', label: '棉、麻、糖、烟草种植' },
  { code: '014', category: 'A 农、林、牧、渔业', major: '01 农业', label: '蔬菜、食用菌及园艺作物种植' },
  { code: '015', category: 'A 农、林、牧、渔业', major: '01 农业', label: '水果种植' },
  { code: '016', category: 'A 农、林、牧、渔业', major: '01 农业', label: '坚果、含油果、香料和饮料作物种植' },
  { code: '017', category: 'A 农、林、牧、渔业', major: '01 农业', label: '中药材种植' },
  { code: '018', category: 'A 农、林、牧、渔业', major: '01 农业', label: '草种植及割草' },
  { code: '019', category: 'A 农、林、牧、渔业', major: '01 农业', label: '其他农业' },
  { code: '021', category: 'A 农、林、牧、渔业', major: '02 林业', label: '林木育种和育苗' },
  { code: '022', category: 'A 农、林、牧、渔业', major: '02 林业', label: '造林和更新' },
  { code: '023', category: 'A 农、林、牧、渔业', major: '02 林业', label: '森林经营、管护和改培' },
  { code: '024', category: 'A 农、林、牧、渔业', major: '02 林业', label: '木材和竹材采运' },
  { code: '025', category: 'A 农、林、牧、渔业', major: '02 林业', label: '林产品采集' },
  { code: '031', category: 'A 农、林、牧、渔业', major: '03 畜牧业', label: '牲畜饲养' },
  { code: '032', category: 'A 农、林、牧、渔业', major: '03 畜牧业', label: '家禽饲养' },
  { code: '033', category: 'A 农、林、牧、渔业', major: '03 畜牧业', label: '狩猎和捕捉动物' },
  { code: '039', category: 'A 农、林、牧、渔业', major: '03 畜牧业', label: '其他畜牧业' },
  { code: '041', category: 'A 农、林、牧、渔业', major: '04 渔业', label: '水产养殖' },
  { code: '042', category: 'A 农、林、牧、渔业', major: '04 渔业', label: '水产捕捞' },
  { code: '051', category: 'A 农、林、牧、渔业', major: '05 农、林、牧、渔专业及辅助性活动', label: '农业专业及辅助性活动' },
  { code: '052', category: 'A 农、林、牧、渔业', major: '05 农、林、牧、渔专业及辅助性活动', label: '林业专业及辅助性活动' },
  { code: '053', category: 'A 农、林、牧、渔业', major: '05 农、林、牧、渔专业及辅助性活动', label: '畜牧专业及辅助性活动' },
  { code: '054', category: 'A 农、林、牧、渔业', major: '05 农、林、牧、渔专业及辅助性活动', label: '渔业专业及辅助性活动' },
  { code: '061', category: 'B 采矿业', major: '06 煤炭开采和洗选业', label: '烟煤和无烟煤开采洗选' },
  { code: '062', category: 'B 采矿业', major: '06 煤炭开采和洗选业', label: '褐煤开采洗选' },
  { code: '069', category: 'B 采矿业', major: '06 煤炭开采和洗选业', label: '其他煤炭采选' },
  { code: '071', category: 'B 采矿业', major: '07 石油和天然气开采业', label: '石油开采' },
  { code: '072', category: 'B 采矿业', major: '07 石油和天然气开采业', label: '天然气开采' },
  { code: '081', category: 'B 采矿业', major: '08 黑色金属矿采选业', label: '铁矿采选' },
  { code: '082', category: 'B 采矿业', major: '08 黑色金属矿采选业', label: '锰矿、铬矿采选' },
  { code: '089', category: 'B 采矿业', major: '08 黑色金属矿采选业', label: '其他黑色金属矿采选' },
  { code: '091', category: 'B 采矿业', major: '09 有色金属矿采选业', label: '常用有色金属矿采选' },
  { code: '092', category: 'B 采矿业', major: '09 有色金属矿采选业', label: '贵金属矿采选' },
  { code: '093', category: 'B 采矿业', major: '09 有色金属矿采选业', label: '稀有稀土金属矿采选' },
  { code: '099', category: 'B 采矿业', major: '09 有色金属矿采选业', label: '其他采矿和采石的辅助活动' },
  { code: '101', category: 'B 采矿业', major: '10 非金属矿采选业', label: '土砂石开采' },
  { code: '102', category: 'B 采矿业', major: '10 非金属矿采选业', label: '化学矿开采' },
  { code: '103', category: 'B 采矿业', major: '10 非金属矿采选业', label: '采盐' },
  { code: '104', category: 'B 采矿业', major: '10 非金属矿采选业', label: '动植物油和油脂的制造' },
  { code: '105', category: 'B 采矿业', major: '10 非金属矿采选业', label: '乳制品的制造' },
  { code: '106', category: 'B 采矿业', major: '10 非金属矿采选业', label: '谷物磨制品的制造' },
  { code: '107', category: 'B 采矿业', major: '10 非金属矿采选业', label: '糖的制造' },
  { code: '108', category: 'B 采矿业', major: '10 非金属矿采选业', label: '牲畜精饲料的制造' },
  { code: '109', category: 'B 采矿业', major: '10 非金属矿采选业', label: '石棉及其他非金属矿采选' },
  { code: '110', category: 'B 采矿业', major: '11 开采专业及辅助性活动', label: '烈酒的蒸馏、精馏及勾兑' },
  { code: '111', category: 'B 采矿业', major: '11 开采专业及辅助性活动', label: '煤炭开采和洗选专业及辅助性活动' },
  { code: '112', category: 'B 采矿业', major: '11 开采专业及辅助性活动', label: '石油和天然气开采专业及辅助性' },
  { code: '119', category: 'B 采矿业', major: '11 开采专业及辅助性活动', label: '其他开采专业及辅助性活动' },
  { code: '120', category: 'B 采矿业', major: '12 其他采矿业', label: '其他采矿业' },
  { code: '131', category: 'C 制造业', major: '13 农副食品加工业', label: '谷物磨制' },
  { code: '132', category: 'C 制造业', major: '13 农副食品加工业', label: '饲料加工' },
  { code: '133', category: 'C 制造业', major: '13 农副食品加工业', label: '植物油加工' },
  { code: '134', category: 'C 制造业', major: '13 农副食品加工业', label: '制糖业' },
  { code: '135', category: 'C 制造业', major: '13 农副食品加工业', label: '屠宰及肉类加工' },
  { code: '136', category: 'C 制造业', major: '13 农副食品加工业', label: '水产品加工' },
  { code: '137', category: 'C 制造业', major: '13 农副食品加工业', label: '蔬菜、菌类、水果和坚果加工' },
  { code: '138', category: 'C 制造业', major: '13 农副食品加工业', label: '其他农副食品加工' },
  { code: '139', category: 'C 制造业', major: '13 农副食品加工业', label: '其他农副食品加工' },
  { code: '141', category: 'C 制造业', major: '14 食品制造业', label: '焙烤食品制造' },
  { code: '142', category: 'C 制造业', major: '14 食品制造业', label: '糖果、巧克力及蜜饯制造' },
  { code: '143', category: 'C 制造业', major: '14 食品制造业', label: '方便食品制造' },
  { code: '144', category: 'C 制造业', major: '14 食品制造业', label: '乳制品制造' },
  { code: '145', category: 'C 制造业', major: '14 食品制造业', label: '罐头食品制造' },
  { code: '146', category: 'C 制造业', major: '14 食品制造业', label: '调味品、发酵制品制造' },
  { code: '149', category: 'C 制造业', major: '14 食品制造业', label: '其他食品制造' },
  { code: '151', category: 'C 制造业', major: '15 酒、饮料和精制茶制造业', label: '酒的制造' },
  { code: '152', category: 'C 制造业', major: '15 酒、饮料和精制茶制造业', label: '饮料制造' },
  { code: '153', category: 'C 制造业', major: '15 酒、饮料和精制茶制造业', label: '精制茶加工' },
  { code: '161', category: 'C 制造业', major: '16 烟草制品业', label: '烟叶复烤' },
  { code: '162', category: 'C 制造业', major: '16 烟草制品业', label: '卷烟制造' },
  { code: '169', category: 'C 制造业', major: '16 烟草制品业', label: '其他烟草制品制造' },
  { code: '170', category: 'C 制造业', major: '17 纺织业', label: '纸浆、纸和纸板的制造' },
  { code: '171', category: 'C 制造业', major: '17 纺织业', label: '棉纺织及印染精加工' },
  { code: '172', category: 'C 制造业', major: '17 纺织业', label: '毛纺织及染整精加工' },
  { code: '173', category: 'C 制造业', major: '17 纺织业', label: '麻纺织及染整精加工' },
  { code: '174', category: 'C 制造业', major: '17 纺织业', label: '丝绢纺织及印染精加工' },
  { code: '175', category: 'C 制造业', major: '17 纺织业', label: '化纤织造及印染精加工' },
  { code: '176', category: 'C 制造业', major: '17 纺织业', label: '针织或钩针编织物及其制品制造' },
  { code: '177', category: 'C 制造业', major: '17 纺织业', label: '家用纺织制成品制造' },
  { code: '178', category: 'C 制造业', major: '17 纺织业', label: '产业用纺织制成品制造' },
  { code: '181', category: 'C 制造业', major: '18 纺织服装、服饰业', label: '机织服装制造' },
  { code: '182', category: 'C 制造业', major: '18 纺织服装、服饰业', label: '针织或钩针编织服装制造' },
  { code: '183', category: 'C 制造业', major: '18 纺织服装、服饰业', label: '服饰制造' },
  { code: '191', category: 'C 制造业', major: '19 皮革、毛皮、羽毛及其制品和制鞋业', label: '皮革鞣制加工' },
  { code: '192', category: 'C 制造业', major: '19 皮革、毛皮、羽毛及其制品和制鞋业', label: '皮革制品制造' },
  { code: '193', category: 'C 制造业', major: '19 皮革、毛皮、羽毛及其制品和制鞋业', label: '毛皮鞣制及制品加工' },
  { code: '194', category: 'C 制造业', major: '19 皮革、毛皮、羽毛及其制品和制鞋业', label: '羽毛（绒）加工及制品制造' },
  { code: '195', category: 'C 制造业', major: '19 皮革、毛皮、羽毛及其制品和制鞋业', label: '制鞋业' },
  { code: '201', category: 'C 制造业', major: '20 木材加工和木、竹、藤、棕、草制品业', label: '木材加工' },
  { code: '202', category: 'C 制造业', major: '20 木材加工和木、竹、藤、棕、草制品业', label: '人造板制造' },
  { code: '203', category: 'C 制造业', major: '20 木材加工和木、竹、藤、棕、草制品业', label: '木质制品制造' },
  { code: '204', category: 'C 制造业', major: '20 木材加工和木、竹、藤、棕、草制品业', label: '竹、藤、棕、草等制品制造' },
  { code: '210', category: 'C 制造业', major: '21 家具制造业', label: '药品、药用化学品及植物药材的制造' },
  { code: '211', category: 'C 制造业', major: '21 家具制造业', label: '木质家具制造' },
  { code: '212', category: 'C 制造业', major: '21 家具制造业', label: '竹、藤家具制造' },
  { code: '213', category: 'C 制造业', major: '21 家具制造业', label: '金属家具制造' },
  { code: '214', category: 'C 制造业', major: '21 家具制造业', label: '塑料家具制造' },
  { code: '219', category: 'C 制造业', major: '21 家具制造业', label: '其他家具制造' },
  { code: '221', category: 'C 制造业', major: '22 造纸和纸制品业', label: '纸浆制造' },
  { code: '222', category: 'C 制造业', major: '22 造纸和纸制品业', label: '造纸' },
  { code: '223', category: 'C 制造业', major: '22 造纸和纸制品业', label: '纸制品制造' },
  { code: '231', category: 'C 制造业', major: '23 印刷和记录媒介复制业', label: '印刷' },
  { code: '232', category: 'C 制造业', major: '23 印刷和记录媒介复制业', label: '装订及印刷相关服务' },
  { code: '233', category: 'C 制造业', major: '23 印刷和记录媒介复制业', label: '记录媒介复制' },
  { code: '239', category: 'C 制造业', major: '23 印刷和记录媒介复制业', label: '混凝土、水泥及石膏制品的制造' },
  { code: '241', category: 'C 制造业', major: '24 文教、工美、体育和娱乐用品制造业', label: '文教办公用品制造' },
  { code: '242', category: 'C 制造业', major: '24 文教、工美、体育和娱乐用品制造业', label: '乐器制造' },
  { code: '243', category: 'C 制造业', major: '24 文教、工美、体育和娱乐用品制造业', label: '工艺美术及礼仪用品制造' },
  { code: '244', category: 'C 制造业', major: '24 文教、工美、体育和娱乐用品制造业', label: '体育用品制造' },
  { code: '245', category: 'C 制造业', major: '24 文教、工美、体育和娱乐用品制造业', label: '玩具制造' },
  { code: '246', category: 'C 制造业', major: '24 文教、工美、体育和娱乐用品制造业', label: '游艺器材及娱乐用品制造' },
  { code: '251', category: 'C 制造业', major: '25 石油、煤炭及其他燃料加工业', label: '精炼石油产品制造' },
  { code: '252', category: 'C 制造业', major: '25 石油、煤炭及其他燃料加工业', label: '煤炭加工' },
  { code: '253', category: 'C 制造业', major: '25 石油、煤炭及其他燃料加工业', label: '核燃料加工' },
  { code: '254', category: 'C 制造业', major: '25 石油、煤炭及其他燃料加工业', label: '生物质燃料加工' },
  { code: '259', category: 'C 制造业', major: '25 石油、煤炭及其他燃料加工业', label: '未另分类的其他金属制品的制造' },
  { code: '261', category: 'C 制造业', major: '26 化学原料和化学制品制造业', label: '基础化学原料制造' },
  { code: '262', category: 'C 制造业', major: '26 化学原料和化学制品制造业', label: '肥料制造' },
  { code: '263', category: 'C 制造业', major: '26 化学原料和化学制品制造业', label: '农药制造' },
  { code: '264', category: 'C 制造业', major: '26 化学原料和化学制品制造业', label: '涂料、油墨、颜料及类似产品制造' },
  { code: '265', category: 'C 制造业', major: '26 化学原料和化学制品制造业', label: '合成材料制造' },
  { code: '266', category: 'C 制造业', major: '26 化学原料和化学制品制造业', label: '专用化学产品制造' },
  { code: '267', category: 'C 制造业', major: '26 化学原料和化学制品制造业', label: '炸药、火工及焰火产品制造' },
  { code: '268', category: 'C 制造业', major: '26 化学原料和化学制品制造业', label: '日用化学产品制造' },
  { code: '271', category: 'C 制造业', major: '27 医药制造业', label: '化学药品原料药制造' },
  { code: '272', category: 'C 制造业', major: '27 医药制造业', label: '化学药品制剂制造' },
  { code: '273', category: 'C 制造业', major: '27 医药制造业', label: '中药饮片加工' },
  { code: '274', category: 'C 制造业', major: '27 医药制造业', label: '中成药生产' },
  { code: '275', category: 'C 制造业', major: '27 医药制造业', label: '兽用药品制造' },
  { code: '276', category: 'C 制造业', major: '27 医药制造业', label: '生物药品制品制造' },
  { code: '277', category: 'C 制造业', major: '27 医药制造业', label: '卫生材料及医药用品制造' },
  { code: '278', category: 'C 制造业', major: '27 医药制造业', label: '卫生材料及医药用品制造' },
  { code: '279', category: 'C 制造业', major: '27 医药制造业', label: '其他电力设备的制造' },
  { code: '281', category: 'C 制造业', major: '28 化学纤维制造业', label: '纤维素纤维原料及纤维制造' },
  { code: '282', category: 'C 制造业', major: '28 化学纤维制造业', label: '合成纤维制造' },
  { code: '283', category: 'C 制造业', major: '28 化学纤维制造业', label: '生物基材料制造' },
  { code: '291', category: 'C 制造业', major: '29 橡胶和塑料制品业', label: '橡胶制品业' },
  { code: '292', category: 'C 制造业', major: '29 橡胶和塑料制品业', label: '塑料制品业' },
  { code: '293', category: 'C 制造业', major: '29 橡胶和塑料制品业', label: '汽车及其发动机零件和附件的制造' },
  { code: '301', category: 'C 制造业', major: '30 非金属矿物制品业', label: '水泥、石灰和石膏制造' },
  { code: '302', category: 'C 制造业', major: '30 非金属矿物制品业', label: '石膏、水泥制品及类似制品制造' },
  { code: '303', category: 'C 制造业', major: '30 非金属矿物制品业', label: '砖瓦、石材等建筑材料制造' },
  { code: '304', category: 'C 制造业', major: '30 非金属矿物制品业', label: '玻璃制造' },
  { code: '305', category: 'C 制造业', major: '30 非金属矿物制品业', label: '玻璃制品制造' },
  { code: '306', category: 'C 制造业', major: '30 非金属矿物制品业', label: '玻璃纤维和玻璃纤维增强塑料制品' },
  { code: '307', category: 'C 制造业', major: '30 非金属矿物制品业', label: '陶瓷制品制造' },
  { code: '308', category: 'C 制造业', major: '30 非金属矿物制品业', label: '耐火材料制品制造' },
  { code: '309', category: 'C 制造业', major: '30 非金属矿物制品业', label: '石墨及其他非金属矿物制品制造' },
  { code: '310', category: 'C 制造业', major: '31 黑色金属冶炼和压延加工业', label: '家具的制造' },
  { code: '311', category: 'C 制造业', major: '31 黑色金属冶炼和压延加工业', label: '炼铁' },
  { code: '312', category: 'C 制造业', major: '31 黑色金属冶炼和压延加工业', label: '炼钢' },
  { code: '313', category: 'C 制造业', major: '31 黑色金属冶炼和压延加工业', label: '钢压延加工' },
  { code: '314', category: 'C 制造业', major: '31 黑色金属冶炼和压延加工业', label: '铁合金冶炼' },
  { code: '321', category: 'C 制造业', major: '32 有色金属冶炼和压延加工业', label: '常用有色金属冶炼' },
  { code: '322', category: 'C 制造业', major: '32 有色金属冶炼和压延加工业', label: '贵金属冶炼' },
  { code: '323', category: 'C 制造业', major: '32 有色金属冶炼和压延加工业', label: '稀有稀土金属冶炼' },
  { code: '324', category: 'C 制造业', major: '32 有色金属冶炼和压延加工业', label: '有色金属合金制造' },
  { code: '325', category: 'C 制造业', major: '32 有色金属冶炼和压延加工业', label: '有色金属压延加工' },
  { code: '329', category: 'C 制造业', major: '32 有色金属冶炼和压延加工业', label: '未另分类的其他用品的制造' },
  { code: '331', category: 'C 制造业', major: '33 金属制品业', label: '结构性金属制品制造' },
  { code: '332', category: 'C 制造业', major: '33 金属制品业', label: '金属工具制造' },
  { code: '333', category: 'C 制造业', major: '33 金属制品业', label: '集装箱及金属包装容器制造' },
  { code: '334', category: 'C 制造业', major: '33 金属制品业', label: '金属丝绳及其制品制造' },
  { code: '335', category: 'C 制造业', major: '33 金属制品业', label: '建筑、安全用金属制品制造' },
  { code: '336', category: 'C 制造业', major: '33 金属制品业', label: '金属表面处理及热处理加工' },
  { code: '337', category: 'C 制造业', major: '33 金属制品业', label: '搪瓷制品制造' },
  { code: '338', category: 'C 制造业', major: '33 金属制品业', label: '金属制日用品制造' },
  { code: '339', category: 'C 制造业', major: '33 金属制品业', label: '铸造及其他金属制品制造' },
  { code: '341', category: 'C 制造业', major: '34 通用设备制造业', label: '锅炉及原动设备制造' },
  { code: '342', category: 'C 制造业', major: '34 通用设备制造业', label: '金属加工机械制造' },
  { code: '343', category: 'C 制造业', major: '34 通用设备制造业', label: '物料搬运设备制造' },
  { code: '344', category: 'C 制造业', major: '34 通用设备制造业', label: '泵、阀门、压缩机及类似机械制造' },
  { code: '345', category: 'C 制造业', major: '34 通用设备制造业', label: '轴承、齿轮和传动部件制造' },
  { code: '346', category: 'C 制造业', major: '34 通用设备制造业', label: '烘炉、风机、包装等设备制造' },
  { code: '347', category: 'C 制造业', major: '34 通用设备制造业', label: '文化、办公用机械制造' },
  { code: '348', category: 'C 制造业', major: '34 通用设备制造业', label: '通用零部件制造' },
  { code: '349', category: 'C 制造业', major: '34 通用设备制造业', label: '其他通用设备制造业' },
  { code: '351', category: 'C 制造业', major: '35 专用设备制造业', label: '采矿、冶金、建筑专用设备制造' },
  { code: '352', category: 'C 制造业', major: '35 专用设备制造业', label: '化工、木材、非金属加工专用设备' },
  { code: '353', category: 'C 制造业', major: '35 专用设备制造业', label: '食品、饮料、烟草及饲料生产专用设' },
  { code: '354', category: 'C 制造业', major: '35 专用设备制造业', label: '印刷、制药、日化及日用品生产专用' },
  { code: '355', category: 'C 制造业', major: '35 专用设备制造业', label: '纺织、服装和皮革加工专用设备制造' },
  { code: '356', category: 'C 制造业', major: '35 专用设备制造业', label: '电子和电工机械专用设备制造' },
  { code: '357', category: 'C 制造业', major: '35 专用设备制造业', label: '农、林、牧、渔专用机械制造' },
  { code: '358', category: 'C 制造业', major: '35 专用设备制造业', label: '医疗仪器设备及器械制造' },
  { code: '359', category: 'C 制造业', major: '35 专用设备制造业', label: '环保、邮政、社会公共服务及其他专' },
  { code: '360', category: 'C 制造业', major: '36 汽车制造业', label: '集水、水处理与水供应' },
  { code: '361', category: 'C 制造业', major: '36 汽车制造业', label: '汽车整车制造' },
  { code: '362', category: 'C 制造业', major: '36 汽车制造业', label: '汽车用发动机制造' },
  { code: '363', category: 'C 制造业', major: '36 汽车制造业', label: '改装汽车制造' },
  { code: '364', category: 'C 制造业', major: '36 汽车制造业', label: '低速汽车制造' },
  { code: '365', category: 'C 制造业', major: '36 汽车制造业', label: '电车制造' },
  { code: '366', category: 'C 制造业', major: '36 汽车制造业', label: '汽车车身、挂车制造' },
  { code: '367', category: 'C 制造业', major: '36 汽车制造业', label: '汽车零部件及配件制造' },
  { code: '370', category: 'C 制造业', major: '37 铁路、船舶、航空航天和其他运输设备制造业', label: '污水处理' },
  { code: '371', category: 'C 制造业', major: '37 铁路、船舶、航空航天和其他运输设备制造业', label: '铁路运输设备制造' },
  { code: '372', category: 'C 制造业', major: '37 铁路、船舶、航空航天和其他运输设备制造业', label: '城市轨道交通设备制造' },
  { code: '373', category: 'C 制造业', major: '37 铁路、船舶、航空航天和其他运输设备制造业', label: '船舶及相关装置制造' },
  { code: '374', category: 'C 制造业', major: '37 铁路、船舶、航空航天和其他运输设备制造业', label: '航空、航天器及设备制造' },
  { code: '375', category: 'C 制造业', major: '37 铁路、船舶、航空航天和其他运输设备制造业', label: '摩托车制造' },
  { code: '376', category: 'C 制造业', major: '37 铁路、船舶、航空航天和其他运输设备制造业', label: '自行车和残疾人座车制造' },
  { code: '377', category: 'C 制造业', major: '37 铁路、船舶、航空航天和其他运输设备制造业', label: '助动车制造' },
  { code: '378', category: 'C 制造业', major: '37 铁路、船舶、航空航天和其他运输设备制造业', label: '非公路休闲车及零配件制造' },
  { code: '379', category: 'C 制造业', major: '37 铁路、船舶、航空航天和其他运输设备制造业', label: '潜水救捞及其他未列明运输设备制造' },
  { code: '381', category: 'C 制造业', major: '38 电气机械和器材制造业', label: '电机制造' },
  { code: '382', category: 'C 制造业', major: '38 电气机械和器材制造业', label: '输配电及控制设备制造' },
  { code: '383', category: 'C 制造业', major: '38 电气机械和器材制造业', label: '电线、电缆、光缆及电工器材制造' },
  { code: '384', category: 'C 制造业', major: '38 电气机械和器材制造业', label: '电池制造' },
  { code: '385', category: 'C 制造业', major: '38 电气机械和器材制造业', label: '家用电力器具制造' },
  { code: '386', category: 'C 制造业', major: '38 电气机械和器材制造业', label: '非电力家用器具制造' },
  { code: '387', category: 'C 制造业', major: '38 电气机械和器材制造业', label: '照明器具制造' },
  { code: '389', category: 'C 制造业', major: '38 电气机械和器材制造业', label: '其他电气机械及器材制造' },
  { code: '390', category: 'C 制造业', major: '39 计算机、通信和其他电子设备制造业', label: '补救活动和其他废物管理服务' },
  { code: '391', category: 'C 制造业', major: '39 计算机、通信和其他电子设备制造业', label: '计算机制造' },
  { code: '392', category: 'C 制造业', major: '39 计算机、通信和其他电子设备制造业', label: '通信设备制造' },
  { code: '393', category: 'C 制造业', major: '39 计算机、通信和其他电子设备制造业', label: '广播电视设备制造' },
  { code: '394', category: 'C 制造业', major: '39 计算机、通信和其他电子设备制造业', label: '雷达及配套设备制造' },
  { code: '395', category: 'C 制造业', major: '39 计算机、通信和其他电子设备制造业', label: '非专业视听设备制造' },
  { code: '396', category: 'C 制造业', major: '39 计算机、通信和其他电子设备制造业', label: '智能消费设备制造' },
  { code: '397', category: 'C 制造业', major: '39 计算机、通信和其他电子设备制造业', label: '电子器件制造' },
  { code: '398', category: 'C 制造业', major: '39 计算机、通信和其他电子设备制造业', label: '电子元件及电子专用材料制造' },
  { code: '399', category: 'C 制造业', major: '39 计算机、通信和其他电子设备制造业', label: '其他电子设备制造' },
  { code: '401', category: 'C 制造业', major: '40 仪器仪表制造业', label: '通用仪器仪表制造' },
  { code: '402', category: 'C 制造业', major: '40 仪器仪表制造业', label: '专用仪器仪表制造' },
  { code: '403', category: 'C 制造业', major: '40 仪器仪表制造业', label: '钟表与计时仪器制造' },
  { code: '404', category: 'C 制造业', major: '40 仪器仪表制造业', label: '光学仪器制造' },
  { code: '405', category: 'C 制造业', major: '40 仪器仪表制造业', label: '衡器制造' },
  { code: '409', category: 'C 制造业', major: '40 仪器仪表制造业', label: '其他仪器仪表制造业' },
  { code: '410', category: 'C 制造业', major: '41 其他制造业', label: '楼宇的建筑' },
  { code: '411', category: 'C 制造业', major: '41 其他制造业', label: '日用杂品制造' },
  { code: '412', category: 'C 制造业', major: '41 其他制造业', label: '核辐射加工' },
  { code: '419', category: 'C 制造业', major: '41 其他制造业', label: '其他未列明制造业' },
  { code: '421', category: 'C 制造业', major: '42 废弃资源综合利用业', label: '金属废料和碎屑加工处理' },
  { code: '422', category: 'C 制造业', major: '42 废弃资源综合利用业', label: '非金属废料和碎屑加工处理' },
  { code: '429', category: 'C 制造业', major: '42 废弃资源综合利用业', label: '其他土木工程项目' },
  { code: '431', category: 'C 制造业', major: '43 金属制品、机械和设备修理业', label: '金属制品修理' },
  { code: '432', category: 'C 制造业', major: '43 金属制品、机械和设备修理业', label: '通用设备修理' },
  { code: '433', category: 'C 制造业', major: '43 金属制品、机械和设备修理业', label: '专用设备修理' },
  { code: '434', category: 'C 制造业', major: '43 金属制品、机械和设备修理业', label: '铁路、船舶、航空航天等运输设备' },
  { code: '435', category: 'C 制造业', major: '43 金属制品、机械和设备修理业', label: '电气设备修理' },
  { code: '436', category: 'C 制造业', major: '43 金属制品、机械和设备修理业', label: '仪器仪表修理' },
  { code: '439', category: 'C 制造业', major: '43 金属制品、机械和设备修理业', label: '其他机械和设备修理业' },
  { code: '441', category: 'D 电力、热力、燃气及水生产和供应业', major: '44 电力、热力生产和供应业', label: '电力生产' },
  { code: '442', category: 'D 电力、热力、燃气及水生产和供应业', major: '44 电力、热力生产和供应业', label: '电力供应' },
  { code: '443', category: 'D 电力、热力、燃气及水生产和供应业', major: '44 电力、热力生产和供应业', label: '热力生产和供应' },
  { code: '451', category: 'D 电力、热力、燃气及水生产和供应业', major: '45 燃气生产和供应业', label: '燃气生产和供应业' },
  { code: '452', category: 'D 电力、热力、燃气及水生产和供应业', major: '45 燃气生产和供应业', label: '生物质燃气生产和供应业' },
  { code: '453', category: 'D 电力、热力、燃气及水生产和供应业', major: '45 燃气生产和供应业', label: '汽车零件和附件的销售' },
  { code: '454', category: 'D 电力、热力、燃气及水生产和供应业', major: '45 燃气生产和供应业', label: '摩托车及有关零件和附件的销售、修理与保养' },
  { code: '461', category: 'D 电力、热力、燃气及水生产和供应业', major: '46 水的生产和供应业', label: '自来水生产和供应' },
  { code: '462', category: 'D 电力、热力、燃气及水生产和供应业', major: '46 水的生产和供应业', label: '污水处理及其再生利用' },
  { code: '463', category: 'D 电力、热力、燃气及水生产和供应业', major: '46 水的生产和供应业', label: '海水淡化处理' },
  { code: '464', category: 'D 电力、热力、燃气及水生产和供应业', major: '46 水的生产和供应业', label: '纺织品、服装和鞋靴的批发' },
  { code: '465', category: 'D 电力、热力、燃气及水生产和供应业', major: '46 水的生产和供应业', label: '农业机械、设备和物资的批发' },
  { code: '466', category: 'D 电力、热力、燃气及水生产和供应业', major: '46 水的生产和供应业', label: '固体、液体和气体燃料及有关产品的批发' },
  { code: '469', category: 'D 电力、热力、燃气及水生产和供应业', major: '46 水的生产和供应业', label: '其他水的处理、利用与分配' },
  { code: '471', category: 'E 建筑业', major: '47 房屋建筑业', label: '住宅房屋建筑' },
  { code: '472', category: 'E 建筑业', major: '47 房屋建筑业', label: '体育场馆建筑' },
  { code: '473', category: 'E 建筑业', major: '47 房屋建筑业', label: '专门商店中汽车燃料的零售' },
  { code: '474', category: 'E 建筑业', major: '47 房屋建筑业', label: '专门商店中音像设备的零售' },
  { code: '475', category: 'E 建筑业', major: '47 房屋建筑业', label: '专门商店中纺织品的零售' },
  { code: '476', category: 'E 建筑业', major: '47 房屋建筑业', label: '专门商店中体育设备的零售' },
  { code: '477', category: 'E 建筑业', major: '47 房屋建筑业', label: '专门商店中服装、鞋靴和皮革制品的零售' },
  { code: '478', category: 'E 建筑业', major: '47 房屋建筑业', label: '在售货摊和市场进行的食品、饮料和烟草产品的' },
  { code: '479', category: 'E 建筑业', major: '47 房屋建筑业', label: '其他房屋建筑业' },
  { code: '481', category: 'E 建筑业', major: '48 土木工程建筑业', label: '铁路、道路、隧道和桥梁工程建筑' },
  { code: '482', category: 'E 建筑业', major: '48 土木工程建筑业', label: '水利和水运工程建筑' },
  { code: '483', category: 'E 建筑业', major: '48 土木工程建筑业', label: '海洋工程建筑' },
  { code: '484', category: 'E 建筑业', major: '48 土木工程建筑业', label: '工矿工程建筑' },
  { code: '485', category: 'E 建筑业', major: '48 土木工程建筑业', label: '架线和管道工程建筑' },
  { code: '486', category: 'E 建筑业', major: '48 土木工程建筑业', label: '节能环保工程施工' },
  { code: '487', category: 'E 建筑业', major: '48 土木工程建筑业', label: '电力工程施工' },
  { code: '489', category: 'E 建筑业', major: '48 土木工程建筑业', label: '其他土木工程建筑' },
  { code: '491', category: 'E 建筑业', major: '49 建筑安装业', label: '电气安装' },
  { code: '492', category: 'E 建筑业', major: '49 建筑安装业', label: '管道和设备安装' },
  { code: '493', category: 'E 建筑业', major: '49 建筑安装业', label: '管道运输' },
  { code: '499', category: 'E 建筑业', major: '49 建筑安装业', label: '其他建筑安装业' },
  { code: '501', category: 'E 建筑业', major: '50 建筑装饰、装修和其他建筑业', label: '建筑装饰和装修业' },
  { code: '502', category: 'E 建筑业', major: '50 建筑装饰、装修和其他建筑业', label: '建筑物拆除和场地准备活动' },
  { code: '503', category: 'E 建筑业', major: '50 建筑装饰、装修和其他建筑业', label: '提供施工设备服务' },
  { code: '509', category: 'E 建筑业', major: '50 建筑装饰、装修和其他建筑业', label: '其他未列明建筑业' },
  { code: '511', category: 'F 批发和零售业', major: '51 批发业', label: '农、林、牧、渔产品批发' },
  { code: '512', category: 'F 批发和零售业', major: '51 批发业', label: '食品、饮料及烟草制品批发' },
  { code: '513', category: 'F 批发和零售业', major: '51 批发业', label: '纺织、服装及家庭用品批发' },
  { code: '514', category: 'F 批发和零售业', major: '51 批发业', label: '文化、体育用品及器材批发' },
  { code: '515', category: 'F 批发和零售业', major: '51 批发业', label: '医药及医疗器材批发' },
  { code: '516', category: 'F 批发和零售业', major: '51 批发业', label: '矿产品、建材及化工产品批发' },
  { code: '517', category: 'F 批发和零售业', major: '51 批发业', label: '机械设备、五金产品及电子产品批发' },
  { code: '518', category: 'F 批发和零售业', major: '51 批发业', label: '贸易经纪与代理' },
  { code: '519', category: 'F 批发和零售业', major: '51 批发业', label: '其他批发业' },
  { code: '521', category: 'F 批发和零售业', major: '52 零售业', label: '综合零售' },
  { code: '522', category: 'F 批发和零售业', major: '52 零售业', label: '食品、饮料及烟草制品专门零售' },
  { code: '523', category: 'F 批发和零售业', major: '52 零售业', label: '纺织、服装及日用品专门零售' },
  { code: '524', category: 'F 批发和零售业', major: '52 零售业', label: '文化、体育用品及器材专门零售' },
  { code: '525', category: 'F 批发和零售业', major: '52 零售业', label: '医药及医疗器材专门零售' },
  { code: '526', category: 'F 批发和零售业', major: '52 零售业', label: '汽车、摩托车、零配件和燃料及其他' },
  { code: '527', category: 'F 批发和零售业', major: '52 零售业', label: '家用电器及电子产品专门零售' },
  { code: '528', category: 'F 批发和零售业', major: '52 零售业', label: '五金、家具及室内装饰材料专门零售' },
  { code: '529', category: 'F 批发和零售业', major: '52 零售业', label: '货摊、无店铺及其他零售业' },
  { code: '531', category: 'G 交通运输、仓储和邮政业', major: '53 铁路运输业', label: '铁路旅客运输' },
  { code: '532', category: 'G 交通运输、仓储和邮政业', major: '53 铁路运输业', label: '铁路货物运输' },
  { code: '533', category: 'G 交通运输、仓储和邮政业', major: '53 铁路运输业', label: '铁路运输辅助活动' },
  { code: '541', category: 'G 交通运输、仓储和邮政业', major: '54 道路运输业', label: '城市公共交通运输' },
  { code: '542', category: 'G 交通运输、仓储和邮政业', major: '54 道路运输业', label: '公路旅客运输' },
  { code: '543', category: 'G 交通运输、仓储和邮政业', major: '54 道路运输业', label: '道路货物运输' },
  { code: '544', category: 'G 交通运输、仓储和邮政业', major: '54 道路运输业', label: '道路运输辅助活动' },
  { code: '551', category: 'G 交通运输、仓储和邮政业', major: '55 水上运输业', label: '水上旅客运输' },
  { code: '552', category: 'G 交通运输、仓储和邮政业', major: '55 水上运输业', label: '水上货物运输' },
  { code: '553', category: 'G 交通运输、仓储和邮政业', major: '55 水上运输业', label: '水上运输辅助活动' },
  { code: '559', category: 'G 交通运输、仓储和邮政业', major: '55 水上运输业', label: '其他住宿' },
  { code: '561', category: 'G 交通运输、仓储和邮政业', major: '56 航空运输业', label: '航空客货运输' },
  { code: '562', category: 'G 交通运输、仓储和邮政业', major: '56 航空运输业', label: '通用航空服务' },
  { code: '563', category: 'G 交通运输、仓储和邮政业', major: '56 航空运输业', label: '航空运输辅助活动' },
  { code: '571', category: 'G 交通运输、仓储和邮政业', major: '57 管道运输业', label: '海底管道运输' },
  { code: '572', category: 'G 交通运输、仓储和邮政业', major: '57 管道运输业', label: '陆地管道运输' },
  { code: '581', category: 'G 交通运输、仓储和邮政业', major: '58 多式联运和运输代理业', label: '多式联运' },
  { code: '582', category: 'G 交通运输、仓储和邮政业', major: '58 多式联运和运输代理业', label: '运输代理业' },
  { code: '591', category: 'G 交通运输、仓储和邮政业', major: '59 装卸搬运和仓储业', label: '装卸搬运' },
  { code: '592', category: 'G 交通运输、仓储和邮政业', major: '59 装卸搬运和仓储业', label: '通用仓储' },
  { code: '593', category: 'G 交通运输、仓储和邮政业', major: '59 装卸搬运和仓储业', label: '低温仓储' },
  { code: '594', category: 'G 交通运输、仓储和邮政业', major: '59 装卸搬运和仓储业', label: '危险品仓储' },
  { code: '595', category: 'G 交通运输、仓储和邮政业', major: '59 装卸搬运和仓储业', label: '谷物、棉花等农产品仓储' },
  { code: '596', category: 'G 交通运输、仓储和邮政业', major: '59 装卸搬运和仓储业', label: '中药材仓储' },
  { code: '599', category: 'G 交通运输、仓储和邮政业', major: '59 装卸搬运和仓储业', label: '其他仓储业' },
  { code: '601', category: 'G 交通运输、仓储和邮政业', major: '60 邮政业', label: '邮政基本服务' },
  { code: '602', category: 'G 交通运输、仓储和邮政业', major: '60 邮政业', label: '快递服务' },
  { code: '609', category: 'G 交通运输、仓储和邮政业', major: '60 邮政业', label: '其他寄递服务' },
  { code: '611', category: 'H 住宿和餐饮业', major: '61 住宿业', label: '旅游饭店' },
  { code: '612', category: 'H 住宿和餐饮业', major: '61 住宿业', label: '一般旅馆' },
  { code: '613', category: 'H 住宿和餐饮业', major: '61 住宿业', label: '民宿服务' },
  { code: '614', category: 'H 住宿和餐饮业', major: '61 住宿业', label: '露营地服务' },
  { code: '619', category: 'H 住宿和餐饮业', major: '61 住宿业', label: '其他住宿业' },
  { code: '620', category: 'H 住宿和餐饮业', major: '62 餐饮业', label: '计算机程序设计活动' },
  { code: '621', category: 'H 住宿和餐饮业', major: '62 餐饮业', label: '正餐服务' },
  { code: '622', category: 'H 住宿和餐饮业', major: '62 餐饮业', label: '快餐服务' },
  { code: '623', category: 'H 住宿和餐饮业', major: '62 餐饮业', label: '饮料及冷饮服务' },
  { code: '624', category: 'H 住宿和餐饮业', major: '62 餐饮业', label: '餐饮配送及外卖送餐服务' },
  { code: '629', category: 'H 住宿和餐饮业', major: '62 餐饮业', label: '其他餐饮业' },
  { code: '631', category: 'I 信息传输、软件和信息技术服务业', major: '63 电信、广播电视和卫星传输服务', label: '电信' },
  { code: '632', category: 'I 信息传输、软件和信息技术服务业', major: '63 电信、广播电视和卫星传输服务', label: '广播电视传输服务' },
  { code: '633', category: 'I 信息传输、软件和信息技术服务业', major: '63 电信、广播电视和卫星传输服务', label: '卫星传输服务' },
  { code: '639', category: 'I 信息传输、软件和信息技术服务业', major: '63 电信、广播电视和卫星传输服务', label: '未另分类的其他信息服务活动' },
  { code: '641', category: 'I 信息传输、软件和信息技术服务业', major: '64 互联网和相关服务', label: '互联网接入及相关服务' },
  { code: '642', category: 'I 信息传输、软件和信息技术服务业', major: '64 互联网和相关服务', label: '互联网信息服务' },
  { code: '643', category: 'I 信息传输、软件和信息技术服务业', major: '64 互联网和相关服务', label: '互联网平台' },
  { code: '644', category: 'I 信息传输、软件和信息技术服务业', major: '64 互联网和相关服务', label: '互联网安全服务' },
  { code: '645', category: 'I 信息传输、软件和信息技术服务业', major: '64 互联网和相关服务', label: '互联网数据服务' },
  { code: '649', category: 'I 信息传输、软件和信息技术服务业', major: '64 互联网和相关服务', label: '其他互联网服务' },
  { code: '651', category: 'I 信息传输、软件和信息技术服务业', major: '65 软件和信息技术服务业', label: '软件开发' },
  { code: '652', category: 'I 信息传输、软件和信息技术服务业', major: '65 软件和信息技术服务业', label: '集成电路设计' },
  { code: '653', category: 'I 信息传输、软件和信息技术服务业', major: '65 软件和信息技术服务业', label: '信息系统集成和物联网技术服务' },
  { code: '654', category: 'I 信息传输、软件和信息技术服务业', major: '65 软件和信息技术服务业', label: '运行维护服务' },
  { code: '655', category: 'I 信息传输、软件和信息技术服务业', major: '65 软件和信息技术服务业', label: '信息处理和存储支持服务' },
  { code: '656', category: 'I 信息传输、软件和信息技术服务业', major: '65 软件和信息技术服务业', label: '信息技术咨询服务' },
  { code: '657', category: 'I 信息传输、软件和信息技术服务业', major: '65 软件和信息技术服务业', label: '数字内容服务' },
  { code: '659', category: 'I 信息传输、软件和信息技术服务业', major: '65 软件和信息技术服务业', label: '其他信息技术服务业' },
  { code: '661', category: 'J 金融业', major: '66 货币金融业', label: '中央银行服务' },
  { code: '662', category: 'J 金融业', major: '66 货币金融业', label: '货币银行服务' },
  { code: '663', category: 'J 金融业', major: '66 货币金融业', label: '非货币银行服务' },
  { code: '664', category: 'J 金融业', major: '66 货币金融业', label: '银行理财服务' },
  { code: '665', category: 'J 金融业', major: '66 货币金融业', label: '银行监管服务' },
  { code: '671', category: 'J 金融业', major: '67 资本市场服务', label: '证券市场服务' },
  { code: '672', category: 'J 金融业', major: '67 资本市场服务', label: '公开募集证券投资基金' },
  { code: '673', category: 'J 金融业', major: '67 资本市场服务', label: '非公开募集证券投资基金' },
  { code: '674', category: 'J 金融业', major: '67 资本市场服务', label: '期货市场服务' },
  { code: '675', category: 'J 金融业', major: '67 资本市场服务', label: '证券期货监管服务' },
  { code: '676', category: 'J 金融业', major: '67 资本市场服务', label: '资本投资服务' },
  { code: '679', category: 'J 金融业', major: '67 资本市场服务', label: '其他资本市场服务' },
  { code: '681', category: 'J 金融业', major: '68 保险业', label: '人身保险' },
  { code: '682', category: 'J 金融业', major: '68 保险业', label: '财产保险' },
  { code: '683', category: 'J 金融业', major: '68 保险业', label: '再保险' },
  { code: '684', category: 'J 金融业', major: '68 保险业', label: '商业养老金' },
  { code: '685', category: 'J 金融业', major: '68 保险业', label: '保险中介服务' },
  { code: '686', category: 'J 金融业', major: '68 保险业', label: '保险资产管理' },
  { code: '687', category: 'J 金融业', major: '68 保险业', label: '保险监管服务' },
  { code: '689', category: 'J 金融业', major: '68 保险业', label: '其他保险活动' },
  { code: '691', category: 'J 金融业', major: '69 其他金融业', label: '金融信托与管理服务' },
  { code: '692', category: 'J 金融业', major: '69 其他金融业', label: '控股公司服务' },
  { code: '693', category: 'J 金融业', major: '69 其他金融业', label: '非金融机构支付服务' },
  { code: '694', category: 'J 金融业', major: '69 其他金融业', label: '金融信息服务' },
  { code: '695', category: 'J 金融业', major: '69 其他金融业', label: '金融资产管理公司' },
  { code: '699', category: 'J 金融业', major: '69 其他金融业', label: '其他未列明金融业' },
  { code: '701', category: 'K 房地产业', major: '70 房地产业', label: '房地产开发经营' },
  { code: '702', category: 'K 房地产业', major: '70 房地产业', label: '物业管理' },
  { code: '703', category: 'K 房地产业', major: '70 房地产业', label: '房地产中介服务' },
  { code: '704', category: 'K 房地产业', major: '70 房地产业', label: '房地产租赁经营' },
  { code: '709', category: 'K 房地产业', major: '70 房地产业', label: '其他房地产业' },
  { code: '711', category: 'L 租赁和商务服务业', major: '71 租赁业', label: '机械设备经营租赁' },
  { code: '712', category: 'L 租赁和商务服务业', major: '71 租赁业', label: '文体设备和用品出租' },
  { code: '713', category: 'L 租赁和商务服务业', major: '71 租赁业', label: '日用品出租' },
  { code: '721', category: 'L 租赁和商务服务业', major: '72 商务服务业', label: '组织管理服务' },
  { code: '722', category: 'L 租赁和商务服务业', major: '72 商务服务业', label: '综合管理服务' },
  { code: '723', category: 'L 租赁和商务服务业', major: '72 商务服务业', label: '法律服务' },
  { code: '724', category: 'L 租赁和商务服务业', major: '72 商务服务业', label: '咨询与调查' },
  { code: '725', category: 'L 租赁和商务服务业', major: '72 商务服务业', label: '广告业' },
  { code: '726', category: 'L 租赁和商务服务业', major: '72 商务服务业', label: '人力资源服务' },
  { code: '727', category: 'L 租赁和商务服务业', major: '72 商务服务业', label: '安全保护服务' },
  { code: '728', category: 'L 租赁和商务服务业', major: '72 商务服务业', label: '会议、展览及相关服务' },
  { code: '729', category: 'L 租赁和商务服务业', major: '72 商务服务业', label: '其他商务服务业' },
  { code: '731', category: 'M 科学研究和技术服务业', major: '73 研究和试验发展', label: '自然科学研究和试验发展' },
  { code: '732', category: 'M 科学研究和技术服务业', major: '73 研究和试验发展', label: '工程和技术研究和试验发展' },
  { code: '733', category: 'M 科学研究和技术服务业', major: '73 研究和试验发展', label: '农业科学研究和试验发展' },
  { code: '734', category: 'M 科学研究和技术服务业', major: '73 研究和试验发展', label: '医学研究和试验发展' },
  { code: '735', category: 'M 科学研究和技术服务业', major: '73 研究和试验发展', label: '社会人文科学研究' },
  { code: '741', category: 'M 科学研究和技术服务业', major: '74 专业技术服务业', label: '气象服务' },
  { code: '742', category: 'M 科学研究和技术服务业', major: '74 专业技术服务业', label: '地震服务' },
  { code: '743', category: 'M 科学研究和技术服务业', major: '74 专业技术服务业', label: '海洋服务' },
  { code: '744', category: 'M 科学研究和技术服务业', major: '74 专业技术服务业', label: '测绘地理信息服务' },
  { code: '745', category: 'M 科学研究和技术服务业', major: '74 专业技术服务业', label: '质检技术服务' },
  { code: '746', category: 'M 科学研究和技术服务业', major: '74 专业技术服务业', label: '环境与生态监测检测服务' },
  { code: '747', category: 'M 科学研究和技术服务业', major: '74 专业技术服务业', label: '地质勘查' },
  { code: '748', category: 'M 科学研究和技术服务业', major: '74 专业技术服务业', label: '工程技术与设计服务' },
  { code: '749', category: 'M 科学研究和技术服务业', major: '74 专业技术服务业', label: '工业与专业设计及其他专业技术服务' },
  { code: '750', category: 'M 科学研究和技术服务业', major: '75 科技推广和应用服务业', label: '兽医活动' },
  { code: '751', category: 'M 科学研究和技术服务业', major: '75 科技推广和应用服务业', label: '技术推广服务' },
  { code: '752', category: 'M 科学研究和技术服务业', major: '75 科技推广和应用服务业', label: '知识产权服务' },
  { code: '753', category: 'M 科学研究和技术服务业', major: '75 科技推广和应用服务业', label: '科技中介服务' },
  { code: '754', category: 'M 科学研究和技术服务业', major: '75 科技推广和应用服务业', label: '创业空间服务' },
  { code: '759', category: 'M 科学研究和技术服务业', major: '75 科技推广和应用服务业', label: '其他科技推广服务业' },
  { code: '761', category: 'N 水利、环境和公共设施管理业', major: '76 水利管理业', label: '防洪除涝设施管理' },
  { code: '762', category: 'N 水利、环境和公共设施管理业', major: '76 水利管理业', label: '水资源管理' },
  { code: '763', category: 'N 水利、环境和公共设施管理业', major: '76 水利管理业', label: '天然水收集与分配' },
  { code: '764', category: 'N 水利、环境和公共设施管理业', major: '76 水利管理业', label: '水文服务' },
  { code: '769', category: 'N 水利、环境和公共设施管理业', major: '76 水利管理业', label: '其他水利管理业' },
  { code: '771', category: 'N 水利、环境和公共设施管理业', major: '77 生态保护和环境治理业', label: '生态保护' },
  { code: '772', category: 'N 水利、环境和公共设施管理业', major: '77 生态保护和环境治理业', label: '环境治理业' },
  { code: '773', category: 'N 水利、环境和公共设施管理业', major: '77 生态保护和环境治理业', label: '其他机械、设备和有形商品的租赁' },
  { code: '774', category: 'N 水利、环境和公共设施管理业', major: '77 生态保护和环境治理业', label: '知识产权和产品的租赁，版权作品除外' },
  { code: '781', category: 'N 水利、环境和公共设施管理业', major: '78 公共设施管理业', label: '市政设施管理' },
  { code: '782', category: 'N 水利、环境和公共设施管理业', major: '78 公共设施管理业', label: '环境卫生管理' },
  { code: '783', category: 'N 水利、环境和公共设施管理业', major: '78 公共设施管理业', label: '城乡市容管理' },
  { code: '784', category: 'N 水利、环境和公共设施管理业', major: '78 公共设施管理业', label: '绿化管理' },
  { code: '785', category: 'N 水利、环境和公共设施管理业', major: '78 公共设施管理业', label: '城市公园管理' },
  { code: '786', category: 'N 水利、环境和公共设施管理业', major: '78 公共设施管理业', label: '游览景区管理' },
  { code: '791', category: 'O 居民服务、修理和其他服务业', major: '79 居民服务业', label: '土地整治服务' },
  { code: '792', category: 'O 居民服务、修理和其他服务业', major: '79 居民服务业', label: '土地调查评估服务' },
  { code: '793', category: 'O 居民服务、修理和其他服务业', major: '79 居民服务业', label: '土地登记服务' },
  { code: '794', category: 'O 居民服务、修理和其他服务业', major: '79 居民服务业', label: '土地登记代理服务' },
  { code: '799', category: 'O 居民服务、修理和其他服务业', major: '79 居民服务业', label: '其他土地管理服务' },
  { code: '801', category: 'O 居民服务、修理和其他服务业', major: '80 机动车、电子产品和日用产品修理业', label: '家庭服务' },
  { code: '802', category: 'O 居民服务、修理和其他服务业', major: '80 机动车、电子产品和日用产品修理业', label: '托儿所服务' },
  { code: '803', category: 'O 居民服务、修理和其他服务业', major: '80 机动车、电子产品和日用产品修理业', label: '洗染服务' },
  { code: '804', category: 'O 居民服务、修理和其他服务业', major: '80 机动车、电子产品和日用产品修理业', label: '理发及美容服务' },
  { code: '805', category: 'O 居民服务、修理和其他服务业', major: '80 机动车、电子产品和日用产品修理业', label: '洗浴和保健养生服务' },
  { code: '806', category: 'O 居民服务、修理和其他服务业', major: '80 机动车、电子产品和日用产品修理业', label: '摄影扩印服务' },
  { code: '807', category: 'O 居民服务、修理和其他服务业', major: '80 机动车、电子产品和日用产品修理业', label: '婚姻服务' },
  { code: '808', category: 'O 居民服务、修理和其他服务业', major: '80 机动车、电子产品和日用产品修理业', label: '殡葬服务' },
  { code: '809', category: 'O 居民服务、修理和其他服务业', major: '80 机动车、电子产品和日用产品修理业', label: '其他居民服务业' },
  { code: '811', category: 'O 居民服务、修理和其他服务业', major: '81 其他服务业', label: '汽车、摩托车等修理与维护' },
  { code: '812', category: 'O 居民服务、修理和其他服务业', major: '81 其他服务业', label: '计算机和办公设备维修' },
  { code: '813', category: 'O 居民服务、修理和其他服务业', major: '81 其他服务业', label: '家用电器修理' },
  { code: '819', category: 'O 居民服务、修理和其他服务业', major: '81 其他服务业', label: '其他日用产品修理业' },
  { code: '821', category: 'O 居民服务、修理和其他服务业', major: '82 其他居民服务业', label: '清洁服务' },
  { code: '822', category: 'O 居民服务、修理和其他服务业', major: '82 其他居民服务业', label: '宠物服务' },
  { code: '823', category: 'O 居民服务、修理和其他服务业', major: '82 其他居民服务业', label: '会议和贸易展览会的举办' },
  { code: '829', category: 'O 居民服务、修理和其他服务业', major: '82 其他居民服务业', label: '其他未列明服务业' },
  { code: '831', category: 'P 教育', major: '83 教育', label: '学前教育' },
  { code: '832', category: 'P 教育', major: '83 教育', label: '初等教育' },
  { code: '833', category: 'P 教育', major: '83 教育', label: '中等教育' },
  { code: '834', category: 'P 教育', major: '83 教育', label: '高等教育' },
  { code: '835', category: 'P 教育', major: '83 教育', label: '特殊教育' },
  { code: '839', category: 'P 教育', major: '83 教育', label: '技能培训、教育辅助及其他教育' },
  { code: '841', category: 'Q 卫生和社会工作', major: '84 卫生', label: '医院' },
  { code: '842', category: 'Q 卫生和社会工作', major: '84 卫生', label: '基层医疗卫生服务' },
  { code: '843', category: 'Q 卫生和社会工作', major: '84 卫生', label: '专业公共卫生服务' },
  { code: '849', category: 'Q 卫生和社会工作', major: '84 卫生', label: '其他卫生活动' },
  { code: '851', category: 'Q 卫生和社会工作', major: '85 社会工作', label: '提供住宿社会工作' },
  { code: '852', category: 'Q 卫生和社会工作', major: '85 社会工作', label: '不提供住宿社会工作' },
  { code: '853', category: 'Q 卫生和社会工作', major: '85 社会工作', label: '高等教育' },
  { code: '854', category: 'Q 卫生和社会工作', major: '85 社会工作', label: '未另分类的其他教育' },
  { code: '855', category: 'Q 卫生和社会工作', major: '85 社会工作', label: '教育辅助活动' },
  { code: '861', category: 'R 文化、体育和娱乐业', major: '86 新闻和出版业', label: '新闻业' },
  { code: '862', category: 'R 文化、体育和娱乐业', major: '86 新闻和出版业', label: '出版业' },
  { code: '869', category: 'R 文化、体育和娱乐业', major: '86 新闻和出版业', label: '其他人体健康活动' },
  { code: '871', category: 'R 文化、体育和娱乐业', major: '87 广播、电视、电影和录音制作业', label: '广播' },
  { code: '872', category: 'R 文化、体育和娱乐业', major: '87 广播、电视、电影和录音制作业', label: '电视' },
  { code: '873', category: 'R 文化、体育和娱乐业', major: '87 广播、电视、电影和录音制作业', label: '影视节目制作' },
  { code: '874', category: 'R 文化、体育和娱乐业', major: '87 广播、电视、电影和录音制作业', label: '广播电视集成播控' },
  { code: '875', category: 'R 文化、体育和娱乐业', major: '87 广播、电视、电影和录音制作业', label: '电影和广播电视节目发行' },
  { code: '876', category: 'R 文化、体育和娱乐业', major: '87 广播、电视、电影和录音制作业', label: '电影放映' },
  { code: '877', category: 'R 文化、体育和娱乐业', major: '87 广播、电视、电影和录音制作业', label: '录音制作' },
  { code: '879', category: 'R 文化、体育和娱乐业', major: '87 广播、电视、电影和录音制作业', label: '其他留宿护理活动' },
  { code: '881', category: 'R 文化、体育和娱乐业', major: '88 文化艺术业', label: '文艺创作与表演' },
  { code: '882', category: 'R 文化、体育和娱乐业', major: '88 文化艺术业', label: '艺术表演场馆' },
  { code: '883', category: 'R 文化、体育和娱乐业', major: '88 文化艺术业', label: '图书馆与档案馆' },
  { code: '884', category: 'R 文化、体育和娱乐业', major: '88 文化艺术业', label: '文物及非物质文化遗产保护' },
  { code: '885', category: 'R 文化、体育和娱乐业', major: '88 文化艺术业', label: '博物馆' },
  { code: '886', category: 'R 文化、体育和娱乐业', major: '88 文化艺术业', label: '烈士陵园、纪念馆' },
  { code: '887', category: 'R 文化、体育和娱乐业', major: '88 文化艺术业', label: '群众文体活动' },
  { code: '889', category: 'R 文化、体育和娱乐业', major: '88 文化艺术业', label: '其他文化艺术业' },
  { code: '891', category: 'R 文化、体育和娱乐业', major: '89 体育', label: '体育组织' },
  { code: '892', category: 'R 文化、体育和娱乐业', major: '89 体育', label: '体育场地设施管理' },
  { code: '893', category: 'R 文化、体育和娱乐业', major: '89 体育', label: '健身休闲活动' },
  { code: '899', category: 'R 文化、体育和娱乐业', major: '89 体育', label: '其他体育' },
  { code: '900', category: 'S 公共管理、社会保障和社会组织', major: '90 娱乐业', label: '艺术创作和文娱活动' },
  { code: '901', category: 'S 公共管理、社会保障和社会组织', major: '90 娱乐业', label: '室内娱乐活动' },
  { code: '902', category: 'S 公共管理、社会保障和社会组织', major: '90 娱乐业', label: '游乐园' },
  { code: '903', category: 'S 公共管理、社会保障和社会组织', major: '90 娱乐业', label: '休闲观光活动' },
  { code: '904', category: 'S 公共管理、社会保障和社会组织', major: '90 娱乐业', label: '彩票活动' },
  { code: '905', category: 'S 公共管理、社会保障和社会组织', major: '90 娱乐业', label: '文化体育娱乐活动与经纪代理服务' },
  { code: '909', category: 'S 公共管理、社会保障和社会组织', major: '90 娱乐业', label: '其他娱乐业' },
  { code: '910', category: 'S 公共管理、社会保障和社会组织', major: '91 中国共产党机关', label: '中国共产党机关' },
  { code: '920', category: 'S 公共管理、社会保障和社会组织', major: '92 国家机构', label: '赌博和押宝活动' },
  { code: '921', category: 'S 公共管理、社会保障和社会组织', major: '92 国家机构', label: '国家权力机构' },
  { code: '922', category: 'S 公共管理、社会保障和社会组织', major: '92 国家机构', label: '国家行政机构' },
  { code: '923', category: 'S 公共管理、社会保障和社会组织', major: '92 国家机构', label: '人民法院和人民检察院' },
  { code: '929', category: 'S 公共管理、社会保障和社会组织', major: '92 国家机构', label: '其他国家机构' },
  { code: '931', category: 'S 公共管理、社会保障和社会组织', major: '93 人民政协、民主党派', label: '人民政协' },
  { code: '932', category: 'S 公共管理、社会保障和社会组织', major: '93 人民政协、民主党派', label: '民主党派' },
  { code: '941', category: 'S 公共管理、社会保障和社会组织', major: '94 社会保障', label: '基本保险' },
  { code: '942', category: 'S 公共管理、社会保障和社会组织', major: '94 社会保障', label: '补充保险' },
  { code: '949', category: 'S 公共管理、社会保障和社会组织', major: '94 社会保障', label: '其他社会保障' },
  { code: '951', category: 'S 公共管理、社会保障和社会组织', major: '95 群众团体、社会团体和其他成员组织', label: '群众团体' },
  { code: '952', category: 'S 公共管理、社会保障和社会组织', major: '95 群众团体、社会团体和其他成员组织', label: '社会团体' },
  { code: '953', category: 'S 公共管理、社会保障和社会组织', major: '95 群众团体、社会团体和其他成员组织', label: '基金会' },
  { code: '954', category: 'S 公共管理、社会保障和社会组织', major: '95 群众团体、社会团体和其他成员组织', label: '宗教组织' },
  { code: '960', category: 'S 公共管理、社会保障和社会组织', major: '96 基层群众自治组织', label: '纺织品和皮毛制品的清洗和干洗' },
  { code: '961', category: 'S 公共管理、社会保障和社会组织', major: '96 基层群众自治组织', label: '社区居民自治组织' },
  { code: '962', category: 'S 公共管理、社会保障和社会组织', major: '96 基层群众自治组织', label: '村民自治组织' },
  { code: '970', category: 'T 国际组织', major: '97 国际组织相关', label: '国际组织' },
  { code: '981', category: 'T 国际组织', major: '98 未加区分的私人家庭活动', label: '未加区分的私人家庭自用物品生产活动' },
  { code: '982', category: 'T 国际组织', major: '98 未加区分的私人家庭活动', label: '未加区分的私人家庭自我服务活动' },
  { code: '990', category: 'T 国际组织', major: '99 其他国际组织活动', label: '国际组织和机构的活动' },
];

// ===== 索引 =====
const _byCode = new Map(MID_CATEGORIES.map(i => [i.code, i]));
const _byLabel = new Map(MID_CATEGORIES.map(i => [i.label, i]));

// 历史 slug → 中类 code（v0.45 之前的 8 项英文 slug）
const LEGACY_SLUG_TO_CODE = {
  'marketing':           '725',  // 广告业（按 PDF 修订版编号）
  'exhibition':          '728',  // 会议、展览及相关服务
  'saas':                '651',  // 软件开发
  'pharma':              '272',  // 化学药品制剂制造
  'banking':             '662',  // 货币银行服务（按 PDF 修订版）
  'ecommerce':           '529',  // 互联网零售（按 PDF 修订版）
  'brand-design':        '725',  // 广告业（图文设计在广告业内）
  'consumer-electronics':'395',  // 计算机制造（家用视听设备在计算机制造内）
};
const LEGACY_SLUG_TO_LABEL = Object.fromEntries(
  Object.entries(LEGACY_SLUG_TO_CODE).map(([slug, code]) => [slug, _byCode.get(code)?.label || slug])
);

function listMids() { return MID_CATEGORIES; }
function listMidsGrouped() {
  const groups = new Map();
  for (const ind of MID_CATEGORIES) {
    if (!groups.has(ind.category)) groups.set(ind.category, []);
    groups.get(ind.category).push(ind);
  }
  return Array.from(groups, ([category, items]) => ({ category, items }));
}
function getMidByCode(code) { return code ? _byCode.get(code) : undefined; }
function resolveIndustryLabel(value) {
  if (!value) return "";
  const byCode = _byCode.get(value);
  if (byCode) return byCode.label;
  if (LEGACY_SLUG_TO_LABEL[value]) return LEGACY_SLUG_TO_LABEL[value];
  const byLabel = _byLabel.get(value);
  if (byLabel) return byLabel.label;
  return value;
}
function labelToCode(label) {
  if (!label) return '';
  // 1) 精确匹配（标准中类名）
  const byLabel = _byLabel.get(label);
  if (byLabel) return byLabel.code;
  // 2) 模糊匹配（LLM 经常输出「石油」「石化」等非标准简称 — 按关键词兜底）
  //   顺序敏感：最具体的关键词先匹配（避免「石油化工」错误命中「石油开采」）
  const fuzzyRules = [
    // 石油化工链
    { keys: ['石油化工', '炼油', '原油加工', '精炼石油', '成品油', '石化', '石油加工', '燃料加工'], code: '251' },  // 精炼石油产品制造
    { keys: ['天然气开采', '天然气勘探', '液化天然气', 'LNG', '煤层气', '页岩气', '天然气'], code: '072' },  // 天然气开采
    { keys: ['石油开采', '石油勘探', '石油钻井', '原油开采', '采油', '油田', '油气田'], code: '071' },  // 石油开采
    { keys: ['煤炭开采', '采煤', '煤矿', '烟煤', '褐煤', '煤炭'], code: '061' },  // 烟煤和无烟煤开采洗选
    // 单字兜底（放在具体规则之后，避免覆盖）
    { keys: ['石油', '油气'], code: '071' },  // 单字「石油」 → 石油开采（默认上游）
    { keys: ['电力', '发电', '电网', '供电'], code: '441' },  // 电力、热力生产和供应业
    // 软件 / 互联网
    { keys: ['软件开发', 'SaaS', '软件研发', '应用软件', '基础软件', '系统软件', '中间件', 'APP开发'], code: '651' },  // 软件开发
    { keys: ['互联网零售', '电商平台', '网上商店', '网络销售', '电商'], code: '529' },  // 货摊、无店铺及其他零售业 / 互联网零售
    { keys: ['互联网搜索', '搜索引擎'], code: '642' },  // 互联网搜索服务
    { keys: ['搜索'], code: '642' },  // 单字「搜索」→ 互联网搜索服务
    { keys: ['互联网信息服务', '互联网平台', '互联网游戏', '互联网'], code: '643' },  // 互联网平台
    { keys: ['信息技术咨询', '信息系统集成', '物联网', 'IT服务', '信息技术服务'], code: '653' },  // 信息系统集成和物联网技术服务
    { keys: ['数据中心', '云计算', '云服务', '大数据'], code: '645' },  // 互联网数据服务
    { keys: ['信息技术咨询', '信息系统集成', '物联网', 'IT服务', '信息技术服务'], code: '653' },  // 信息系统集成和物联网技术服务
    // 金融
    { keys: ['商业银行', '银行服务', '银行业务', '中央银行', '存款贷款', '银行'], code: '662' },  // 货币银行服务
    { keys: ['证券', '股票', '上市', '交易所', '资本市场', '基金销售'], code: '671' },  // 证券市场服务
    { keys: ['人身保险', '财产保险', '再保险', '保险'], code: '681' },  // 人身保险
    { keys: ['金融信托', '财富管理', '金融控股'], code: '691' },  // 金融信托与管理服务
    // 商务服务
    { keys: ['会议展览', '会展', '展会', '展览'], code: '728' },  // 会议、展览及相关服务
    { keys: ['广告业', '广告设计', '互联网广告', '广告'], code: '725' },  // 广告业
    { keys: ['旅行社', '旅游', '导游'], code: '727' },  // 旅行社及相关服务
    { keys: ['人力资源', '招聘', '猎头', '劳务派遣'], code: '726' },  // 人力资源服务
    { keys: ['法律服务', '律师事务所', '律师'], code: '723' },  // 法律服务
    { keys: ['会计审计', '审计', '会计'], code: '7231' },  // 注：审计在咨询里
    { keys: ['咨询', '顾问'], code: '724' },  // 咨询与调查
    // 房地产
    { keys: ['房地产开发', '楼盘', '地产开发', '房地产'], code: '701' },  // 房地产开发经营
    { keys: ['物业管理'], code: '702' },  // 物业管理
    { keys: ['房地产中介', '房产中介', '地产中介'], code: '703' },  // 房地产中介服务
    // 教育
    { keys: ['学前教育', '幼儿园', '托儿所'], code: '831' },  // 学前教育
    { keys: ['初等教育', '小学'], code: '832' },  // 初等教育
    { keys: ['中等教育', '中学', '高中', '初中'], code: '833' },  // 中等教育
    { keys: ['高等教育', '大学', '高校'], code: '834' },  // 高等教育
    { keys: ['职业培训', '技能培训', '教育辅助', '教育培训', '培训'], code: '839' },  // 技能培训、教育辅助及其他教育
    { keys: ['教育'], code: '831' },  // 单字「教育」兜底 → 学前教育（用户可手动改）
    // 卫生
    { keys: ['医院', '综合医院', '专科医院'], code: '841' },  // 医院
    { keys: ['基层医疗', '社区卫生', '卫生院', '诊所'], code: '842' },  // 基层医疗卫生服务
    { keys: ['公共卫生', '疾控', '防疫'], code: '843' },  // 专业公共卫生服务
    // 制造
    { keys: ['汽车制造', '整车制造', '汽车'], code: '361' },  // 汽车整车制造
    { keys: ['计算机制造', '计算机', '电脑制造', 'PC制造'], code: '391' },  // 计算机制造
    { keys: ['通信设备', '通信制造'], code: '392' },  // 通信设备制造
    { keys: ['电子器件', '芯片', '半导体', '集成电路'], code: '397' },  // 电子器件制造
    { keys: ['家用电器', '家电', '家用视听'], code: '385' },  // 家用电力器具制造
    { keys: ['医药制造', '制药', '化学药品', '中药', '生物药品', '医药', '疫苗', '医疗器械'], code: '272' },  // 化学药品制剂制造
    { keys: ['食品', '农业', '畜牧', '种植', '粮食'], code: '139' },  // 食品制造
    { keys: ['化妆品'], code: '265' },  // 化妆品
    { keys: ['生物'], code: '273' },  // 生物药品
    { keys: ['基因'], code: '273' },  // 基因技术
    { keys: ['化学原料', '基础化工', '化学制品'], code: '261' },  // 基础化学原料制造
    { keys: ['塑料制品', '塑料制造'], code: '292' },  // 塑料制品业
    { keys: ['橡胶制品', '轮胎制造'], code: '291' },  // 橡胶制品业
    // 文化
    { keys: ['影视', '电影制作', '影视节目'], code: '862' },  // 电影制作与发行
    { keys: ['出版', '图书出版', '出版社'], code: '862' },  // 出版业（修订版 PDF 里 8621 不存在，用 862）
    { keys: ['广播', '电视'], code: '861' },  // 广播、电视
    // 通用 fallback（最后才匹配，避免覆盖具体规则）
    { keys: ['制造', '生产'], code: '361' },  // 兜底：通用制造 → 汽车制造（不好，但胜于空）
    // 能源（放兜底附近，避免被"石油""电力"等更具体的词抢走）
    { keys: ['新能源', '清洁能源'], code: '441' },  // 电力（新能源发电归电力大类）
    { keys: ['能源', '发电'], code: '441' },  // 电力
    { keys: ['燃气'], code: '443' },  // 燃气
    { keys: ['燃料', '煤'], code: '061' },  // 煤炭开采
    { keys: ['金融'], code: '662' },  // 银行
    { keys: ['数字货币', '加密货币', '虚拟货币'], code: '662' },  // 银行（金融兜底）
    // 化工
    { keys: ['化工', '化学'], code: '261' },  // 基础化学原料
    // 整车 / 汽车
    { keys: ['整车'], code: '361' },  // 汽车整车
    { keys: ['电动车', '电动汽车'], code: '361' },  // 汽车
    { keys: ['风电'], code: '441' },  // 电力（风电归电力大类）
    { keys: ['光伏', '太阳能'], code: '441' },  // 电力
    { keys: ['核能'], code: '441' },  // 电力
    // 金融
    { keys: ['保险'], code: '681' },  // 人身保险
    { keys: ['证券', '基金', '信托', '财富管理'], code: '671' },  // 证券市场服务
    { keys: ['投资'], code: '725' },  // 投资与资产管理
    { keys: ['支付'], code: '643' },  // 互联网平台（支付走互联网）
    // 媒体 / 文化
    { keys: ['新闻', '报刊', '报纸', '媒体', '传媒'], code: '861' },  // 新闻业
    { keys: ['出版', '图书', '动漫', '动画', '漫画', '游戏', '电竞'], code: '862' },  // 出版业（修订版 PDF 里 86 中类只有 861/862/869）
    { keys: ['音乐', '短视频', '直播', '影视', '电视', '广播', '视听'], code: '861' },  // 归新闻业（电视/广播/影视都属新闻和出版业 86）
    // 零售 / 物流
    { keys: ['零售'], code: '521' },  // 综合零售
    { keys: ['批发'], code: '511' },  // 生产资料批发
    { keys: ['超市', '百货'], code: '521' },  // 综合零售
    { keys: ['便利店'], code: '522' },  // 便利店
    { keys: ['电商'], code: '529' },  // 互联网零售
    { keys: ['O2O'], code: '529' },  // 互联网零售
    { keys: ['即时零售'], code: '529' },  // 互联网零售
    // 交通 / 物流
    { keys: ['交通', '运输'], code: '531' },  // 多式联运
    { keys: ['物流'], code: '542' },  // 货运物流
    { keys: ['快递', '快运'], code: '544' },  // 邮政快递
    { keys: ['货运', '货代', '货代'], code: '542' },  // 货运物流
    // 餐饮 / 酒店
    { keys: ['餐饮', '外卖', '正餐', '火锅'], code: '621' },  // 正餐服务
    { keys: ['奶茶', '咖啡', '酒吧', '烘焙', '饮品', '饮品'], code: '623' },  // 饮料及冷饮服务
    { keys: ['酒店', '民宿', '度假', '住宿'], code: '611' },  // 宾馆住宿
    // 互联网 / 软件
    { keys: ['数据安全'], code: '645' },  // 互联网数据服务
    { keys: ['数据'], code: '645' },  // 数据服务兜底
    { keys: ['互联网'], code: '643' },  // 互联网平台
    { keys: ['软件开发'], code: '651' },  // 软件开发
    { keys: ['SaaS'], code: '651' },  // 软件即服务
    { keys: ['云计算'], code: '645' },  // 云服务
  ];
  for (const rule of fuzzyRules) {
    if (rule.keys.some(k => label.includes(k))) return rule.code;
  }
  return '';
}
function labelsForPrompt() {
  return listMidsGrouped().map(g =>
    `${g.category}：${g.items.map(i => `${i.code} ${i.label}`).join('、')}`
  ).join("\n");
}

module.exports = {
  MID_CATEGORIES, listMids, listMidsGrouped, getMidByCode,
  resolveIndustryLabel, labelToCode, labelsForPrompt,
  LEGACY_SLUG_TO_CODE, LEGACY_SLUG_TO_LABEL,
};