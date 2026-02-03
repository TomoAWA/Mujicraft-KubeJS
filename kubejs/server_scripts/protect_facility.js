// 保护公共设施方块
// 防止玩家破坏指定区域内的方块

// 定义需要保护的区域
const protectedAreas = [
    {
        name: "example",
        dimension: "minecraft:overworld", // 维度
        x1: 0, y1: 0, z1: 0,
        x2: 0, y2: 0, z2: 0
    },
    {
        name: "枢纽",
        dimension: "minecraft:overworld",
        x1: 123, y1: 47, z1: 221,
        x2: 163, y2: 73, z2: 196
    }
]

// 检查坐标是否在保护区域内
function isInProtectedArea(level, pos) {
    let dimension = level.dimension.toString()
    
    for (let area of protectedAreas) {
        if (dimension !== area.dimension) continue
        
        let x = pos.x
        let y = pos.y
        let z = pos.z
        
        let minX = Math.min(area.x1, area.x2)
        let maxX = Math.max(area.x1, area.x2)
        let minY = Math.min(area.y1, area.y2)
        let maxY = Math.max(area.y1, area.y2)
        let minZ = Math.min(area.z1, area.z2)
        let maxZ = Math.max(area.z1, area.z2)
        
        if (x >= minX && x <= maxX &&
            y >= minY && y <= maxY &&
            z >= minZ && z <= maxZ) {
            return area.name
        }
    }
    
    return null
}

// 监听方块破坏事件
BlockEvents.broken(event => {
    let player = event.player
    if (!player) return
    
    // 检查是否为OP（管理员可以破坏）
    if (player.op) return
    
    let level = event.level
    let pos = event.block.pos
    
    // 检查是否在保护区域内
    let areaName = isInProtectedArea(level, pos)
    if (areaName) {
        // 先发送消息，再取消事件
        player.tell(`§c该区域（${areaName}）受到保护，无法破坏！`)
        player.server.runCommand(`title ${player.username} actionbar {"text":"§c该区域（${areaName}）受到保护！","bold":true}`)
        
        // 取消破坏事件
        event.cancel()
    }
})

// 监听方块放置事件
BlockEvents.placed(event => {
    let player = event.player
    if (!player) return
    
    // 检查是否为OP
    if (player.op) return
    
    let level = event.level
    let block = event.block
    let pos = block.pos
    
    // 检查是否在保护区域内
    let areaName = isInProtectedArea(level, pos)
    if (areaName) {
        // 发送提示消息
        player.tell(`§c该区域（${areaName}）受到保护，无法放置方块！`)
        player.server.runCommand(`title ${player.username} actionbar {"text":"§c该区域（${areaName}）受到保护！","bold":true}`)
        
        // 获取放置的方块对应的物品
        let blockItem = block.item
        let playerName = player.username
        
        // 先移除方块
        block.set('minecraft:air')
        
        // 延迟1tick后给玩家物品，确保放置消耗已经完成
        event.server.scheduleInTicks(1, () => {
            let p = event.server.getPlayer(playerName)
            if (p) {
                p.give(blockItem)
            }
        })
    }
})

console.info('═══════════════════════════════════════════════════════')
console.info('🏛️  公共设施保护系统 V1.0')
console.info('📍  保护区域: ' + protectedAreas.length + ' 个')
protectedAreas.forEach(area => {
    console.info('   ├─ 🗺️  ' + area.name + ' (' + area.dimension.replace('minecraft:', '') + ')')
})
console.info('🔐  权限: OP 可绕过保护')
console.info('✅  状态: 已成功加载')
console.info('═══════════════════════════════════════════════════════')