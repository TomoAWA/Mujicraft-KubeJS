// ═══════════════════════════════════════════════════════════
// 抽卡系统 - Gacha System
// 作者：Kiro AI
// 版本：4.3 (配置驱动版)
// 日期：2026-02-02
// 
// 特性：
// - 通过 gacha_settings.json 的 banners 字段控制加载哪些卡池
// - 新建卡池只需创建 JSON 并将其名称添加到 gacha_settings.json
// - 动态建立票据映射
// - 支持生成村民召唤命令
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// 配置变量
// ═══════════════════════════════════════════════════════════

let GACHA_SETTINGS = null;
let GACHA_BANNERS = {};       // 卡池名 -> 配置
let TICKET_BANNER_MAP = {};   // 票据类型 -> 卡池名（动态生成）
let configLoaded = false;

// ═══════════════════════════════════════════════════════════
// 默认配置（备用）
// ═══════════════════════════════════════════════════════════

const DEFAULT_SETTINGS = {
    broadcast: {
        enabled: true,
        rarities: ['SSR', 'UP', '新春限定']
    }
};

// ═══════════════════════════════════════════════════════════
// 配置加载函数
// ═══════════════════════════════════════════════════════════

function loadSettings() {
    try {
        let data = JsonIO.read('kubejs/config/gacha_settings.json');
        if (data && data.broadcast) {
            GACHA_SETTINGS = data;
            console.info('[抽卡系统] 全局设置加载成功！');
            return true;
        }
    } catch (e) {
        console.warn('[抽卡系统] 无法读取全局设置: ' + e);
    }
    GACHA_SETTINGS = DEFAULT_SETTINGS;
    return false;
}

function loadBanner(bannerName) {
    // 如果已缓存，直接返回
    if (GACHA_BANNERS[bannerName]) {
        return GACHA_BANNERS[bannerName];
    }

    // 构建文件路径
    let filePath = 'kubejs/config/gacha_pools/' + bannerName + '.json';

    try {
        let data = JsonIO.read(filePath);
        if (data && data.pools && data.rates) {
            GACHA_BANNERS[bannerName] = data;

            // 自动建立票据映射
            if (data.tickets) {
                if (data.tickets.single && data.tickets.single.type) {
                    TICKET_BANNER_MAP[data.tickets.single.type] = bannerName;
                }
                if (data.tickets.multi && data.tickets.multi.type) {
                    TICKET_BANNER_MAP[data.tickets.multi.type] = bannerName;
                }
            }

            console.info('[抽卡系统] 卡池 ' + bannerName + ' 加载成功！');
            return data;
        }
    } catch (e) {
        console.warn('[抽卡系统] 无法读取卡池 ' + bannerName + ': ' + e);
    }

    return null;
}

// 扫描并加载所有卡池
function scanAndLoadAllBanners() {
    // KubeJS 6 受限环境，无法直接自动扫描目录
    // 解决方案：从 gacha_settings.json 读取卡池列表

    let bannerList = [];

    if (GACHA_SETTINGS && GACHA_SETTINGS.banners) {
        bannerList = GACHA_SETTINGS.banners;
        console.info('[抽卡系统] 从配置文件读取卡池列表: ' + bannerList.join(', '));
    } else {
        // 备用默认列表
        bannerList = ['normal', 'advanced', 'legendary', 'standard'];
        console.warn('[抽卡系统] 配置中未找到 banners 列表，使用默认列表');
    }

    // 加载列表中的每个卡池
    bannerList.forEach(function (name) {
        loadBanner(name);
    });

    console.info('[抽卡系统] 当前加载卡池: ' + Object.keys(GACHA_BANNERS).join(', '));
}
function loadConfig() {
    if (configLoaded) return true;

    console.info('═══════════════════════════════════════════════════════════');
    console.info('  🎲 抽卡系统 (Gacha System) v4.2 正在加载...');
    console.info('═══════════════════════════════════════════════════════════');

    loadSettings();
    scanAndLoadAllBanners();

    configLoaded = true;
    console.info('[抽卡系统] ✅ 配置加载完成！');
    return true;
}

// 启动时加载配置
loadConfig();

// ═══════════════════════════════════════════════════════════
// 全服播报函数
// ═══════════════════════════════════════════════════════════

function broadcastRarePull(player, bannerName, rarity, reward) {
    if (!GACHA_SETTINGS) loadSettings();

    let broadcast = GACHA_SETTINGS.broadcast;
    if (!broadcast || !broadcast.enabled) return;

    // 检查是否需要播报这个稀有度
    let shouldBroadcast = false;
    if (broadcast.rarities) {
        for (let i = 0; i < broadcast.rarities.length; i++) {
            if (broadcast.rarities[i] === rarity) {
                shouldBroadcast = true;
                break;
            }
        }
    }

    if (!shouldBroadcast) return;

    // 使用 Text API 构建播报消息
    let message = Text.gold('★ ').bold(true)
        .append(Text.yellow(player.name.string))
        .append(Text.gold(' 在 '))
        .append(Text.aqua(bannerName))
        .append(Text.gold(' 中抽到了 '))
        .append(Text.gold(rarity).bold(true))
        .append(Text.gold(' - '))
        .append(Text.white(reward.name))
        .append(Text.gold(' ★').bold(true));

    // 全服播报
    let server = player.server;
    server.tell(message);

    console.info('[抽卡系统] 全服播报: ' + player.name.string + ' 抽到 ' + rarity + ' - ' + reward.name);
}

// ═══════════════════════════════════════════════════════════
// 抽卡函数
// ═══════════════════════════════════════════════════════════

function performGacha(player, bannerName) {
    let banner = loadBanner(bannerName);
    if (!banner) {
        player.tell(Text.red('[抽卡系统] 找不到卡池: ' + bannerName));
        return null;
    }

    let rates = banner.rates;
    if (!rates) {
        player.tell(Text.red('[抽卡系统] 卡池配置错误: ' + bannerName));
        return null;
    }

    let random = Math.random() * 100;

    // 确定抽中的稀有度
    let rarity = 'N';  // 默认

    // 按照配置中的概率计算（SSR -> SR -> R -> N）
    if (rates.SSR && random < rates.SSR) {
        rarity = 'SSR';
    } else if (rates.SR && random < (rates.SSR || 0) + rates.SR) {
        rarity = 'SR';
    } else if (rates.R && random < (rates.SSR || 0) + (rates.SR || 0) + rates.R) {
        rarity = 'R';
    } else if (rates.N !== undefined && rates.N > 0) {
        rarity = 'N';
    } else {
        // 无 N 卡时默认 R
        rarity = 'R';
    }

    // 检查是否有自定义稀有度（如 UP、新春限定等）
    let cumulative = (rates.SSR || 0) + (rates.SR || 0) + (rates.R || 0) + (rates.N || 0);
    for (let r in rates) {
        if (r !== 'N' && r !== 'R' && r !== 'SR' && r !== 'SSR') {
            let threshold = cumulative + rates[r];
            if (random >= cumulative && random < threshold) {
                rarity = r;
                break;
            }
            cumulative = threshold;
        }
    }

    // 从对应稀有度的奖池中随机选择
    let pool = banner.pools[rarity];
    if (!pool || pool.length === 0) {
        // 降级到 R 卡
        pool = banner.pools.R || banner.pools.N;
        if (pool && pool.length > 0) {
            rarity = banner.pools.R ? 'R' : 'N';
        } else {
            player.tell(Text.red('[抽卡系统] 奖池为空: ' + bannerName + ' / ' + rarity));
            return null;
        }
    }

    let reward = pool[Math.floor(Math.random() * pool.length)];

    return { rarity: rarity, reward: reward, bannerName: banner._bannerName || bannerName };
}

// ═══════════════════════════════════════════════════════════
// 十连抽保底机制
// ═══════════════════════════════════════════════════════════

function perform10Gacha(player, bannerName) {
    let banner = loadBanner(bannerName);
    if (!banner) return [];

    let results = [];

    // 先抽10次
    for (let i = 0; i < 10; i++) {
        let result = performGacha(player, bannerName);
        if (result) results.push(result);
    }

    if (results.length < 10) return results;

    // 检查保底规则
    let guarantees = banner.guarantees;
    if (!guarantees) return results;

    // 最小稀有度保底
    if (guarantees.minRarity) {
        let minRarity = guarantees.minRarity;
        let hasMinRarity = results.some(function (r) {
            if (minRarity === 'R') return r.rarity !== 'N';
            if (minRarity === 'SR') return r.rarity === 'SR' || r.rarity === 'SSR';
            if (minRarity === 'SSR') return r.rarity === 'SSR';
            return r.rarity === minRarity;
        });

        if (!hasMinRarity) {
            let pool = banner.pools[minRarity];
            if (pool && pool.length > 0) {
                let reward = pool[Math.floor(Math.random() * pool.length)];
                results[9] = { rarity: minRarity, reward: reward, bannerName: banner._bannerName || bannerName };
            }
        }
    }

    // SSR 保底
    if (guarantees.minSSR) {
        let ssrCount = results.filter(function (r) { return r.rarity === 'SSR'; }).length;
        if (ssrCount < guarantees.minSSR) {
            let pool = banner.pools.SSR;
            if (pool && pool.length > 0) {
                let reward = pool[Math.floor(Math.random() * pool.length)];
                results[9] = { rarity: 'SSR', reward: reward, bannerName: banner._bannerName || bannerName };
            }
        }
    }

    // SR 保底
    if (guarantees.minSR) {
        let srCount = results.filter(function (r) { return r.rarity === 'SR'; }).length;
        if (srCount < guarantees.minSR) {
            let pool = banner.pools.SR;
            if (pool && pool.length > 0) {
                for (let j = 8; j >= 0 && srCount < guarantees.minSR; j--) {
                    if (results[j].rarity === 'N' || results[j].rarity === 'R') {
                        let reward = pool[Math.floor(Math.random() * pool.length)];
                        results[j] = { rarity: 'SR', reward: reward, bannerName: banner._bannerName || bannerName };
                        srCount++;
                    }
                }
            }
        }
    }

    return results;
}

// ═══════════════════════════════════════════════════════════
// 给予奖励
// ═══════════════════════════════════════════════════════════

function giveReward(player, reward) {
    try {
        // 确保 count 是整数
        let count = parseInt(reward.count) || 1;

        let itemStack;

        // 1. 创建基础物品堆
        // KubeJS 6 Item.of(id, count) 返回 ItemStackJS
        itemStack = Item.of(reward.item, count);

        // 2. 应用自定义 NBT (如果有) - 使用原版命令
        if (reward.nbt) {
            // KubeJS 6 的 Item.of 不支持内联 NBT，使用 /give 命令
            try {
                // 确保 nbt 是字符串
                let nbtContent = String(reward.nbt).trim();
                if (nbtContent.startsWith('{') && nbtContent.endsWith('}')) {
                    nbtContent = nbtContent.substring(1, nbtContent.length - 1);
                }

                // 构建 display 部分 (使用 itemName 和 itemLore 字段)
                let displayParts = [];
                if (reward.itemName) {
                    let nameJson = JSON.stringify({ text: reward.itemName, color: 'yellow', italic: false });
                    displayParts.push("Name:'" + nameJson + "'");
                }
                if (reward.itemLore && reward.itemLore.length > 0) {
                    let loreEntries = reward.itemLore.map(function (line) {
                        return "'" + JSON.stringify({ text: line, color: 'gray', italic: true }) + "'";
                    });
                    displayParts.push('Lore:[' + loreEntries.join(',') + ']');
                }

                // 合并 NBT
                let finalNbt = '{' + nbtContent;
                if (displayParts.length > 0) {
                    finalNbt += ',display:{' + displayParts.join(',') + '}';
                }
                finalNbt += '}';

                let cmd = 'give @s ' + reward.item + finalNbt + ' ' + count;
                player.runCommandSilent(cmd);
                return; // 成功返回
            } catch (e) {
                console.error('NBT命令失败: ' + e);
            }
        }

        // 3. 应用自定义物品显示属性
        // 使用独立字段: itemName (物品名称) 和 itemLore (物品描述)
        // 与 name 字段分离，name 仅用于聊天显示
        // 支持三种情况: 有itemName无itemLore、有itemLore无itemName、两者都有

        if (reward.itemName) {
            itemStack = itemStack.withName(Text.of(reward.itemName).yellow().italic(false));
        }

        if (reward.itemLore && Array.isArray(reward.itemLore) && reward.itemLore.length > 0) {
            let loreLines = [];
            reward.itemLore.forEach(function (line) {
                loreLines.push(Text.of(line).gray().italic(true));
            });
            itemStack = itemStack.withLore(loreLines);
        }

        player.give(itemStack);
    } catch (e) {
        console.error('[抽卡系统] 给予物品失败: ' + e);
        // 降级：仅给予物品 ID + 数量
        try {
            player.give(Item.of(reward.item, parseInt(reward.count) || 1));
            if (player.op) player.tell(Text.red('属性应用失败，已发放原物。错误: ' + e));
        } catch (e2) {
            console.error('彻底失败: ' + e2);
        }
    }
}

// ═══════════════════════════════════════════════════════════
// 显示抽卡结果
// ═══════════════════════════════════════════════════════════

function colorText(text, rarity) {
    // 使用 Text API 根据稀有度返回带颜色的文本
    if (rarity === 'SSR' || rarity === 'UP') {
        return Text.gold(text);
    } else if (rarity === '新春限定') {
        return Text.red(text).bold(true);
    } else if (rarity === 'SR') {
        return Text.lightPurple(text);
    } else if (rarity === 'R') {
        return Text.blue(text);
    } else {
        return Text.white(text);
    }
}

function showGachaResult(player, bannerName, rarity, reward) {
    player.tell(Text.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    player.tell(colorText('✦ 恭喜获得 ' + rarity + ' ✦', rarity).bold(true));
    player.tell(colorText(reward.name, rarity));
    player.tell(Text.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    // 播放特效（从配置加载）
    playEffect(player, rarity);

    // 全服播报
    broadcastRarePull(player, bannerName, rarity, reward);
}

function playEffect(player, rarity) {
    if (!GACHA_SETTINGS) loadSettings();

    // 默认特效配置
    let effects = GACHA_SETTINGS.rarityEffects || {};
    let effect = effects[rarity];

    // 如果没有特定配置，检查是否是自定义稀有度（通常 SSR 级别）
    if (!effect) {
        if (rarity === 'SSR' || rarity === 'UP' || rarity === '新春限定' || rarity === '限定') {
            effect = effects['SSR']; // 默认使用 SSR 特效
        } else if (rarity === 'SR') {
            effect = effects['SR'];
        }
    }

    if (effect) {
        // 播放声音
        if (effect.sound) {
            player.runCommandSilent('playsound ' + effect.sound + ' player @s ~ ~ ~ 1 1');
        }

        // 播放粒子
        if (effect.particle) {
            let count = effect.particleCount || 30;
            let cmd = 'particle ' + effect.particle + ' ~ ~1 ~ 0.5 0.5 0.5 0.1 ' + count;
            player.runCommandSilent(cmd);
        }

        // 额外消息
        if (effect.message) {
            player.tell(Text.of(effect.message).color(effect.color || 'gold').bold(true));
        }
    }
}

// ═══════════════════════════════════════════════════════════
// 生成村民召唤命令
// ═══════════════════════════════════════════════════════════

function generateVillagerCommand() {
    let recipes = [];

    // 遍历所有卡池，生成交易
    for (let bannerName in GACHA_BANNERS) {
        let banner = GACHA_BANNERS[bannerName];
        if (!banner.tickets) continue;

        // 单抽券
        if (banner.tickets.single) {
            let t = banner.tickets.single;
            let recipe = generateRecipeNBT(t, false);
            recipes.push(recipe);
        }

        // 十连券
        if (banner.tickets.multi) {
            let t = banner.tickets.multi;
            let recipe = generateRecipeNBT(t, true);
            recipes.push(recipe);
        }
    }

    return recipes.join(',');
}

function generateRecipeNBT(ticket, isMulti) {
    // 支持两种 lore 格式:
    // 1. 字符串: "文本" -> 灰色
    // 2. 对象: { "text": "文本", "color": "gold" } -> 指定颜色
    let loreStr = ticket.lore.map(function (line) {
        if (typeof line === 'object' && line.text) {
            // 对象格式: 支持自定义颜色
            let color = line.color || 'gray';
            return "'{\"text\":\"" + line.text + "\",\"color\":\"" + color + "\",\"italic\":false}'";
        } else {
            // 字符串格式: 默认灰色
            return "'{\"text\":\"" + line + "\",\"color\":\"gray\",\"italic\":false}'";
        }
    }).join(',');

    let boldStr = ticket.bold ? ',\"bold\":true' : '';

    return '{maxUses:2147483647,priceMultiplier:0f,demand:0,specialPrice:0,' +
        'buy:{id:\"' + ticket.price.item + '\",Count:' + ticket.price.count + '},' +
        'sell:{id:\"minecraft:paper\",Count:1,tag:{' +
        'gacha_ticket:1b,gacha_type:\"' + ticket.type + '\",' +
        "display:{Name:'{\"text\":\"" + ticket.name + "\",\"color\":\"" + ticket.color + "\",\"italic\":false" + boldStr + "}',Lore:[" + loreStr + "]}}}}";
}

// ═══════════════════════════════════════════════════════════
// 右键使用抽卡券事件
// ═══════════════════════════════════════════════════════════

ItemEvents.rightClicked(event => {
    let player = event.player;
    let item = event.item;

    if (!item.nbt || !item.nbt.gacha_ticket) return;

    let gachaType = item.nbt.gacha_type;
    let bannerName = TICKET_BANNER_MAP[gachaType];

    if (!bannerName) {
        player.tell(Text.red('[抽卡系统] 未知的抽卡券类型: ' + gachaType));
        return;
    }

    // 判断是单抽还是十连
    let isMulti = gachaType.endsWith('_10');

    // 单抽
    if (!isMulti) {
        let result = performGacha(player, bannerName);
        if (result) {
            giveReward(player, result.reward);
            showGachaResult(player, result.bannerName, result.rarity, result.reward);
            item.count--;
        }
    }
    // 十连
    else {
        let results = perform10Gacha(player, bannerName);

        if (results.length === 0) return;

        let banner = loadBanner(bannerName);
        let displayName = banner._bannerName || bannerName;

        player.tell(Text.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        player.tell(Text.yellow('✦ ' + displayName + ' - 十连抽卡结果 ✦').bold(true));
        player.tell(Text.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

        let counts = {};
        let highestRarity = null;
        let highestReward = null;

        results.forEach(function (r, i) {
            giveReward(player, r.reward);
            counts[r.rarity] = (counts[r.rarity] || 0) + 1;

            // 记录最高稀有度
            if (r.rarity === 'SSR' || r.rarity === 'UP' || r.rarity === '新春限定') {
                highestRarity = r.rarity;
                highestReward = r.reward;
            } else if (!highestRarity && r.rarity === 'SR') {
                highestRarity = 'SR';
                highestReward = r.reward;
            }

            // 使用 colorText 函数显示带颜色的结果
            let resultText = Text.white((i + 1) + '. ').append(colorText('[' + r.rarity + '] ' + r.reward.name, r.rarity));
            player.tell(resultText);
        });

        player.tell(Text.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

        // 统计
        let stats = Text.gray('统计：');
        for (let r in counts) {
            stats = stats.append(colorText(counts[r] + r + ' ', r));
        }
        player.tell(stats);

        player.tell(Text.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

        // 特效和播报（只播报最高稀有度）
        // 特效（播放最高稀有度的特效）
        if (highestRarity) {
            playEffect(player, highestRarity);
        } else {
            playEffect(player, 'R');
        }

        // 全服播报（如果有多个金光，每一个都会播报！）
        results.forEach(function (r) {
            // broadcastRarePull 内部会检查是否需要在全服播报
            // 所以这里直接对每个结果尝试调用即可，不符合稀有度的会被忽略
            broadcastRarePull(player, displayName, r.rarity, r.reward);
        });

        item.count--;
    }
});

// ═══════════════════════════════════════════════════════════
// 管理命令
// ═══════════════════════════════════════════════════════════

// 重载配置
ServerEvents.customCommand('gacha_reload', event => {
    if (!event.player.op) {
        event.player.tell(Text.red('❌ 您没有权限执行此命令！'));
        return;
    }

    configLoaded = false;
    GACHA_BANNERS = {};
    TICKET_BANNER_MAP = {};
    loadConfig();
    event.player.tell(Text.green('[抽卡系统] 配置已重载！'));
    event.player.tell(Text.gray('已加载卡池: ' + Object.keys(GACHA_BANNERS).join(', ')));
});

// 生成村民命令
// 生成并召唤村民
ServerEvents.customCommand('gacha_villager', event => {
    if (!event.player.op) {
        event.player.tell(Text.red('❌ 您没有权限执行此命令！'));
        return;
    }

    let recipes = generateVillagerCommand();

    // 构建 NBT 数据字符串
    // 注意：在 execute run summon 中，~ ~ ~ 是相对于执行位置的
    let nbt = '{CustomName:\'{"text":"抽卡商店","color":"gold","bold":true}\',CustomNameVisible:1b,PersistenceRequired:1b,Tags:["shop_villager","gacha_shop"],Attributes:[{Name:"generic.movement_speed",Base:0}],VillagerData:{profession:"minecraft:cleric",level:5,type:"minecraft:plains"},Offers:{Recipes:[' + recipes + ']}}';

    // 使用玩家的 runCommandSilent 执行 summon
    try {
        let cmd = 'summon minecraft:villager ~ ~ ~ ' + nbt;
        event.player.runCommandSilent(cmd);

        event.player.tell(Text.green('✅ 已在您脚下生成抽卡商店村民！'));
        event.player.runCommandSilent('playsound minecraft:entity.villager.celebrate player @s ~ ~ ~ 1 1');
    } catch (e) {
        event.player.tell(Text.red('❌ 生成村民失败: ' + e));
        console.error('[抽卡系统] 生成村民失败: ' + e);
        // 如果命令太长失败，还是写个文件备用
        JsonIO.write('kubejs/logs/gacha_villager_error.txt', recipes);
        event.player.tell(Text.gray('交易数据已转存至日志，可能是 NBT 太长了。'));
    }
});

// 清除最近的抽卡村民
ServerEvents.customCommand('gacha_kill', event => {
    if (!event.player.op) {
        event.player.tell(Text.red('❌ 您没有权限执行此命令！'));
        return;
    }

    let player = event.player;
    // 杀死半径 10 格内最近的一个带有 gacha_shop 标签的实体
    let cmd = 'kill @e[type=villager,tag=gacha_shop,distance=..10,limit=1,sort=nearest]';

    try {
        if (player.runCommandSilent(cmd) > 0) {
            player.tell(Text.green('🗑️ 已清除最近的抽卡商店村民！'));
            player.runCommandSilent('playsound minecraft:entity.villager.death player @s ~ ~ ~ 1 1');
            player.runCommandSilent('particle minecraft:cloud ~ ~1 ~ 0.5 0.5 0.5 0.1 20');
        } else {
            player.tell(Text.yellow('⚠️ 附近 10 格内没有找到抽卡商店村民。'));
        }
    } catch (e) {
        player.tell(Text.red('❌ 清除失败: ' + e));
    }
});

// 列出所有卡池
ServerEvents.customCommand('gacha_list', event => {
    event.player.tell(Text.yellow('═══════════════════════════════'));
    event.player.tell(Text.gold('当前已加载的卡池:').bold(true));
    event.player.tell(Text.yellow('═══════════════════════════════'));

    for (let bannerName in GACHA_BANNERS) {
        let banner = GACHA_BANNERS[bannerName];
        let displayName = banner._bannerName || bannerName;
        let rates = banner.rates;

        event.player.tell(Text.white('• ' + displayName)
            .append(Text.gray(' (SSR: ' + (rates.SSR || 0) + '%)')));
    }

    event.player.tell(Text.yellow('═══════════════════════════════'));
});

// ═══════════════════════════════════════════════════════════
console.info('[抽卡系统] Gacha System v4.0 已加载！');
console.info('[抽卡系统] 完全数据驱动：新建卡池只需创建 JSON 文件');
console.info('[抽卡系统] 命令：');
console.info('[抽卡系统]   /kubejs custom_command gacha_reload - 重载配置');
console.info('[抽卡系统]   /kubejs custom_command gacha_villager - 在脚下生成商店村民');
console.info('[抽卡系统]   /kubejs custom_command gacha_kill - 清除附近的商店村民');
console.info('[抽卡系统]   /kubejs custom_command gacha_list - 列出卡池');
