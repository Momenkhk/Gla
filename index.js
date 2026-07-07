const { 
    Client, GatewayIntentBits, Partials, EmbedBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    PermissionsBitField, ActivityType, Events, REST, Routes, Collection,
    ChannelType
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const transcript = require('discord-html-transcripts');

// ==========================================
// 1. التحقق من وجود ملفات مهمة
// ==========================================
if (!fs.existsSync('./config.json')) {
    console.error('❌ ملف config.json غير موجود!');
    process.exit(1);
}

if (!config.token) {
    console.error('❌ التوكن غير موجود في config.json!');
    process.exit(1);
}

// ==========================================
// 2. قاعدة البيانات مع نسخ احتياطي
// ==========================================
const DB_PATH = './database.json';
const DB_BACKUP_PATH = './database.backup.json';

function loadDatabase() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            const defaultDB = { 
                isStoreOpen: true, 
                usersPoints: {}, 
                shortcuts: {},
                proofCount: 0,
                pointsRewardConfig: []
            };
            fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 4));
            return defaultDB;
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ خطأ في قراءة قاعدة البيانات:', error);
        if (fs.existsSync(DB_BACKUP_PATH)) {
            try {
                const backupData = fs.readFileSync(DB_BACKUP_PATH, 'utf8');
                fs.writeFileSync(DB_PATH, backupData);
                return JSON.parse(backupData);
            } catch (backupError) {
                console.error('❌ فشل استعادة النسخة الاحتياطية:', backupError);
                return { isStoreOpen: true, usersPoints: {}, shortcuts: {}, proofCount: 0, pointsRewardConfig: [] };
            }
        }
        return { isStoreOpen: true, usersPoints: {}, shortcuts: {}, proofCount: 0, pointsRewardConfig: [] };
    }
}

let database = loadDatabase();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message]
});

// ==========================================
// 3. الثوابت مع تحقق
// ==========================================
const PARIS_GUILD_ID = config.guildId || "1355134323841306765";
const PARIS_CATEGORY_ID = config.categoryId || "1521691574977822801";
const TEAM_ROLE_ID = config.teamRoleId || "1381374307455860893";
const TAX_CHANNEL_ID = config.taxChannelId || "";
const ADMIN_ROLE_ID = config.adminRole || "";
const LOG_CHANNEL_ID = config.logChannel || "";

// ==========================================
// 4. المتغيرات العامة
// ==========================================
client.commands = new Collection();
global.isStoreOpen = database.isStoreOpen ?? true;
global.usersPoints = database.usersPoints || {};
global.shortcuts = database.shortcuts || {};
global.pointsRewardConfig = database.pointsRewardConfig || [];
global.proofCount = database.proofCount || 0;

// دالة حفظ محسنة مع نسخة احتياطية
global.saveDatabase = () => {
    try {
        const data = JSON.stringify({
            isStoreOpen: global.isStoreOpen,
            usersPoints: global.usersPoints,
            shortcuts: global.shortcuts,
            proofCount: global.proofCount || 0,
            pointsRewardConfig: global.pointsRewardConfig || []
        }, null, 4);
        
        if (fs.existsSync(DB_PATH)) {
            fs.writeFileSync(DB_BACKUP_PATH, fs.readFileSync(DB_PATH));
        }
        
        fs.writeFileSync(DB_PATH, data);
        return true;
    } catch (error) {
        console.error('❌ خطأ في حفظ قاعدة البيانات:', error);
        return false;
    }
};

// ==========================================
// 5. تحميل الأوامر
// ==========================================
const slashCommands = [];
const commandFiles = [];

try {
    const commandsPath = path.join(__dirname, 'commands');
    if (fs.existsSync(commandsPath)) {
        const files = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        commandFiles.push(...files);
    }
} catch (error) {
    console.error('❌ خطأ في قراءة مجلد الأوامر:', error);
}

for (const file of commandFiles) {
    try {
        const cmd = require(`./commands/${file}`);
        const name = cmd.name || (cmd.data ? cmd.data.name : null);
        if (name) {
            client.commands.set(name, cmd);
            if (cmd.data) slashCommands.push(cmd.data.toJSON());
            console.log(`✅ تم تحميل الأمر: ${name}`);
        }
    } catch (error) {
        console.error(`❌ خطأ في تحميل الأمر ${file}:`, error);
    }
}

// ==========================================
// 6. حدث الجاهزية
// ==========================================
client.once('ready', async () => {
    console.log(`✅ تم تسجيل الدخول: ${client.user.tag}`);
    console.log(`📊 عدد الأوامر المحملة: ${client.commands.size}`);
    
    try {
        const rest = new REST({ version: '10' }).setToken(config.token);
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, PARIS_GUILD_ID),
            { body: slashCommands }
        );
        console.log('✅ تم تسجيل الأوامر السريعة بنجاح');
    } catch (error) {
        console.error('❌ خطأ في تسجيل الأوامر السريعة:', error);
    }

    client.user.setPresence({
        activities: [{ 
            name: `Fancy Store`, 
            type: ActivityType.Watching,
            url: "https://www.twitch.tv/Fancy_programmer"
        }],
        status: 'dnd',
    });
    
    console.log(`🎮 البوت جاهز للعمل في سيرفر: ${client.guilds.cache.get(PARIS_GUILD_ID)?.name || 'غير معروف'}`);
});

// ==========================================
// 7. نظام الرسائل
// ==========================================
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    try {
        // --- نظام الضريبة المحسن ---
        if (TAX_CHANNEL_ID && message.channel.id === TAX_CHANNEL_ID) {
            await handleTaxChannel(message);
            return;
        }

        // --- نظام الشراء ---
        if (message.channel.parentId === PARIS_CATEGORY_ID && 
            message.content === 'شراء' && 
            !message.channel.name.startsWith('credit-')) {
            await handlePurchaseMessage(message);
            return;
        }

        // --- نظام الاختصارات ---
        const shortcutHandled = await handleShortcuts(message);
        if (shortcutHandled) return;

        // --- الأوامر العادية ---
        if (!message.content.startsWith(config.prefix)) return;
        
        const args = message.content.slice(config.prefix.length).trim().split(/ +/);
        const cmdName = args.shift().toLowerCase();
        const cmd = client.commands.get(cmdName) || 
                    client.commands.find(c => c.aliases && c.aliases.includes(cmdName));
        
        if (cmd) {
            await handleCommand(message, cmd, args);
        }
    } catch (error) {
        console.error('❌ خطأ في معالجة الرسالة:', error);
        await message.reply('❌ حدث خطأ أثناء معالجة طلبك. الرجاء المحاولة لاحقاً.')
            .catch(() => {});
    }
});

// ==========================================
// 8. دوال مساعدة للرسائل
// ==========================================

async function handleTaxChannel(message) {
    try {
        let raw = message.content.trim();
        raw = raw.replace(/,/g, '').replace(/\s/g, '');
        
        if (!/^[\d.]+$/.test(raw)) {
            await message.delete().catch(() => {});
            await message.author.send({
                content: '❌ **ممنوع التحدث في هذه الروم**\n📝 يرجى إدخال رقم فقط (مثل: 100 أو 100.50)'
            }).catch(() => {});
            return;
        }
        
        const value = Number(raw);
        
        if (Number.isNaN(value) || value <= 0) {
            await message.delete().catch(() => {});
            await message.author.send({
                content: '❌ **قيمة غير صالحة**\n📝 يرجى إدخال رقم موجب (مثل: 100 أو 100.50)'
            }).catch(() => {});
            return;
        }
        
        const taxRate = 0.05;
        const taxAmount = value * taxRate;
        const totalWithTax = value + taxAmount;
        
        const formatNumber = (num) => {
            if (Number.isInteger(num)) {
                return num.toString();
            }
            return num.toFixed(2).replace(/\.00$/, '');
        };
        
        const formattedOriginal = formatNumber(value);
        const formattedTax = formatNumber(taxAmount);
        const formattedTotal = formatNumber(totalWithTax);
        
        const taxEmbed = new EmbedBuilder()
            .setTitle('🧾 **فاتورة الضريبة**')
            .setColor('#FFD700')
            .setThumbnail('https://cdn.discordapp.com/emojis/1494107894017163284.png')
            .addFields(
                { name: '💰 **المبلغ الأصلي**', value: `\`${formattedOriginal}\` $`, inline: true },
                { name: '📊 **الضريبة (5%)**', value: `\`+ ${formattedTax}\` $`, inline: true },
                { name: '✅ **الإجمالي مع الضريبة**', value: `\`${formattedTotal}\` $`, inline: true }
            )
            .setFooter({ text: 'Fancy Store | نظام الضريبة', iconURL: message.guild.iconURL() })
            .setTimestamp();
        
        await message.channel.send({ 
            content: `> <a:money:1494107894017163284> **تم حساب الضريبة بنجاح**`,
            embeds: [taxEmbed] 
        });
        
        await message.delete().catch(() => {});
        console.log(`✅ تم حساب الضريبة: ${value} + 5% = ${totalWithTax} | المستخدم: ${message.author.tag}`);
        
    } catch (error) {
        console.error('❌ خطأ في نظام الضريبة:', error);
        await message.channel.send('❌ حدث خطأ أثناء حساب الضريبة').catch(() => {});
    }
}

async function handlePurchaseMessage(message) {
    const paymentMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_pay_method')
            .setPlaceholder('إختر طريقة الدفع المناسبة لك')
            .addOptions([
                { label: 'فودافون كاش', value: 'فودافون كاش', emoji: '<:Cash:1489762925450367077>' },
                { label: 'انستا باي', value: 'انستا باي', emoji: '<:Instapay:1489763191537008791>' },
                { label: 'باي بال', value: 'باي بال', emoji: '<:Wa_PayPal:1521787399007375390>' },
                { label: 'كربتو', value: 'كربتو', emoji: '<:crypto:1489763878018613368>' },
                { label: 'آسيا سيل', value: 'آسيا سيل', emoji: '<:Asia:1491197708038443139>' },
                { label: 'كريديت', value: 'كريديت', emoji: '<:credits:1468640707815149732>' },
                { label: 'ريزر', value: 'ريزر', emoji: '<:rezer:1489764712022544580>' },
                { label: 'زين كــاش العراق', value: 'زين كــاش العراق', emoji: '<:Zaincash:1489765549033525290>' },
                { label: 'تحويل بنكي', value: 'تحويل بنكي', emoji: '🏦' },
                { label: 'تيلدا', value: 'تيلدا', emoji: '<:emoji_28:1489763631108456620>' },
            ])
    );
    
    await message.reply({ 
        content: `**الرجاء اختيار وسيلة الدفع المناسبة لك لإتمام عملية الشراء في Fancy STORE :**`, 
        components: [paymentMenu] 
    });
}

async function handleShortcuts(message) {
    const normalizedContent = message.content.trim().toLowerCase();
    const shortcutConfig = global.shortcuts[normalizedContent];
    
    if (!shortcutConfig) return false;

    try {
        const finalResponse = shortcutConfig.response
            .replaceAll('{user}', `<@${message.author.id}>`)
            .replaceAll('{username}', message.author.username);

        await message.channel.send({ content: finalResponse });

        if (shortcutConfig.deleteTriggerMessage) {
            await message.delete().catch(() => {});
        }
        return true;
    } catch (error) {
        console.error('❌ خطأ في معالجة الاختصار:', error);
        return false;
    }
}

async function handleCommand(message, cmd, args) {
    if (cmd.adminOnly === true && ADMIN_ROLE_ID) {
        if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
            await message.reply('❌ ليس لديك صلاحية لاستخدام هذا الأمر.').catch(() => {});
            return;
        }
    }
    
    try {
        await cmd.execute(message, args, client);
    } catch (error) {
        console.error(`❌ خطأ في تنفيذ الأمر ${cmd.name}:`, error);
        await message.reply('❌ حدث خطأ أثناء تنفيذ الأمر.').catch(() => {});
    }
}

// ==========================================
// 9. نظام التفاعلات
// ==========================================
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const slash = client.commands.get(interaction.commandName);
            if (slash) {
                try {
                    await slash.execute(interaction, [], client);
                } catch (error) {
                    console.error(`❌ خطأ في تنفيذ الأمر السريع ${interaction.commandName}:`, error);
                    await interaction.reply({ 
                        content: '❌ حدث خطأ أثناء تنفيذ الأمر.', 
                        ephemeral: true 
                    }).catch(() => {});
                }
            }
            return;
        }

        if (interaction.isButton()) {
            await handleButtonInteractions(interaction);
            return;
        }

        if (interaction.isStringSelectMenu()) {
            await handleSelectMenuInteractions(interaction);
            return;
        }

        if (interaction.isModalSubmit()) {
            await handleModalInteractions(interaction);
            return;
        }
    } catch (error) {
        console.error('❌ خطأ في معالجة التفاعل:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: '❌ حدث خطأ أثناء معالجة طلبك.', 
                    ephemeral: true 
                });
            }
        } catch (e) {
            console.error('❌ فشل في إرسال رسالة الخطأ:', e);
        }
    }
});

// ==========================================
// 10. دوال معالجة الأزرار
// ==========================================

async function handleButtonInteractions(interaction) {
    const { customId } = interaction;

    // اختصارات
    if (customId === 'open_shortcut_create_modal') {
        await showShortcutCreateModal(interaction);
        return;
    }
    
    if (customId === 'open_shortcut_delete_modal') {
        await showShortcutDeleteModal(interaction);
        return;
    }
    
    if (customId === 'show_shortcuts_list') {
        await showShortcutsList(interaction);
        return;
    }

    // إغلاق التكت
    if (customId === 'close_ticket') {
        await handleCloseTicket(interaction);
        return;
    }

    if (customId === 'confirm_del') {
        await confirmDeleteTicket(interaction);
        return;
    }

    if (customId === 'cancel_del') {
        await interaction.update({ content: 'تم الإلغاء.', components: [], ephemeral: true });
        return;
    }
}

async function showShortcutCreateModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('shortcut_create_modal')
        .setTitle('إنشاء اختصار');

    const shortcutInput = new TextInputBuilder()
        .setCustomId('shortcut_key')
        .setLabel('الاختصار (بدون مسافات)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(40)
        .setPlaceholder('مثال: قوانين');

    const responseInput = new TextInputBuilder()
        .setCustomId('shortcut_response')
        .setLabel('الرسالة اللي البوت يرسلها')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(2000)
        .setPlaceholder('تقدر تستخدم {user} و {username}');

    const deleteInput = new TextInputBuilder()
        .setCustomId('shortcut_delete_trigger')
        .setLabel('حذف رسالة العضو؟ (yes/no)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('yes أو no');

    modal.addComponents(
        new ActionRowBuilder().addComponents(shortcutInput),
        new ActionRowBuilder().addComponents(responseInput),
        new ActionRowBuilder().addComponents(deleteInput),
    );

    await interaction.showModal(modal);
}

async function showShortcutDeleteModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('shortcut_delete_modal')
        .setTitle('حذف اختصار');

    const shortcutInput = new TextInputBuilder()
        .setCustomId('shortcut_key_to_delete')
        .setLabel('اسم الاختصار المراد حذفه')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(40);

    modal.addComponents(new ActionRowBuilder().addComponents(shortcutInput));
    await interaction.showModal(modal);
}

async function showShortcutsList(interaction) {
    const keys = Object.keys(global.shortcuts);
    if (!keys.length) {
        return interaction.reply({ 
            content: '📭 لا يوجد اختصارات محفوظة حالياً.', 
            ephemeral: true 
        });
    }

    const list = keys
        .slice(0, 30)
        .map((key, i) => `${i + 1}) \`${key}\` - حذف رسالة العضو: **${global.shortcuts[key].deleteTriggerMessage ? 'نعم' : 'لا'}**`)
        .join('\n');

    await interaction.reply({
        content: `### 📋 الاختصارات الحالية\n${list}${keys.length > 30 ? '\n... ويوجد اختصارات إضافية.' : ''}`,
        ephemeral: true,
    });
}

async function handleCloseTicket(interaction) {
    if (!ADMIN_ROLE_ID || !interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
        return interaction.reply({ 
            content: '❌ للإدارة فقط!', 
            ephemeral: true 
        });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_del').setLabel('تأكيد').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cancel_del').setLabel('إلغاء').setStyle(ButtonStyle.Secondary)
    );
    
    await interaction.reply({ 
        content: '⚠️ تأكيد إغلاق التكت؟', 
        components: [row], 
        ephemeral: true 
    });
}

async function confirmDeleteTicket(interaction) {
    await interaction.update({ content: '🔄 جاري الأرشفة والحذف...', components: [] });
    
    try {
        const logCh = client.channels.cache.get(LOG_CHANNEL_ID);
        
        const file = await transcript.createTranscript(interaction.channel, { 
            limit: -1, 
            fileName: `Ticket-${interaction.channel.name}-${Date.now()}.html`, 
            poweredBy: false 
        });
        
        const embed = new EmbedBuilder()
            .setTitle('🎫 Ticket Closed')
            .setColor('#FF0000')
            .setTimestamp()
            .addFields(
                { name: '👤 User', value: `<@${interaction.channel.topic || 'غير معروف'}>`, inline: true },
                { name: '🛠 Staff', value: `<@${interaction.user.id}>`, inline: true },
                { name: '📝 Channel', value: interaction.channel.name, inline: true }
            );

        if (logCh) {
            await logCh.send({ embeds: [embed], files: [file] });
        }

        setTimeout(async () => {
            try {
                await interaction.channel.delete();
                console.log(`✅ تم حذف التكت: ${interaction.channel.name}`);
            } catch (error) {
                console.error('❌ خطأ في حذف التكت:', error);
            }
        }, 3000);
    } catch (error) {
        console.error('❌ خطأ في أرشفة التكت:', error);
        await interaction.editReply({ 
            content: '❌ حدث خطأ أثناء أرشفة التكت.', 
            components: [] 
        });
    }
}

// ==========================================
// 11. معالجة القوائم المنسدلة
// ==========================================

async function handleSelectMenuInteractions(interaction) {
    const { customId, values } = interaction;

    if (customId === 'select_ticket') {
        await handleTicketSelect(interaction);
        return;
    }

    if (customId === 'select_pay_method') {
        const pay = values[0];
        await interaction.message.delete().catch(() => {});
        await interaction.channel.send({ 
            content: `**طريقة الدفع المختارة هي: (${pay})**` 
        });
        return;
    }
}

async function handleTicketSelect(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    if (!global.isStoreOpen) {
        return interaction.editReply({ 
            content: `**الخدمة مغلقة مؤقتاً برجاء متابعه مواعيد العمل <#${config.instructionsChannel || '1521691610268565604'}>. <a:9407pepepopcorn:1490026512882073611> **` 
        });
    }

    const type = interaction.values[0];
    
    if (type === 'refresh') {
        return interaction.editReply({
            content: '✅ تم تحديث القائمة.',
            components: []
        });
    }

    const sections = {
        'Nitro': { display: 'Nitro <:Nitro:1489766405615386755>' },
        'Effect': { display: 'Effect <a:effect:1489766309255446589>' },
        'Other': { display: 'Other <a:wait:1459324539233243186>' }
    };
    const currentSec = sections[type] || { display: type };

    const checkTicket = interaction.guild.channels.cache.find(c => c.topic === interaction.user.id);
    if (checkTicket) {
        return interaction.editReply({ 
            content: `⚠️ لديك تكت بالفعل: ${checkTicket}` 
        });
    }

    try {
        const ticketChannel = await createTicketChannel(interaction, `order-${interaction.user.username}`, type);

        const welcomeEmbed = new EmbedBuilder()
            .setAuthor({ 
                name: `Hello @${interaction.user.username} !`, 
                iconURL: interaction.user.displayAvatarURL() 
            })
            .setDescription(`<:hug:1489767585326039071> **Hello <@${interaction.user.id}> !**\n\n<:emoji_18:1468639510421307615>\n**Your ${type} ticket has been successfully opened.**\n\n\n<a:9407pepepopcorn:1490026512882073611>\n**Please wait for the team <@&${TEAM_ROLE_ID}> to assist you.**\n\n**Client:** <@${interaction.user.id}>\n**Creation Time:** <t:${Math.floor(Date.now() / 1000)}:R>\n**Section:** ${currentSec.display}\n**Assigned Team:** <@&${TEAM_ROLE_ID}>`)
            .setColor('#2b2d31');

        const closeBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Close')
                .setEmoji('<a:close:1489767100900970607>')
                .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ 
            content: `<@${interaction.user.id}> - <@&${TEAM_ROLE_ID}>`, 
            embeds: [welcomeEmbed], 
            components: [closeBtn] 
        });
        
        await ticketChannel.send({ 
            content: `**Hi - السلام عليكم ورحمة الله وبركاته**\n**Customers _ ♡**\n\n**برجاء كتابه كلمه "شراء" لمعرفة طرق الدفع المتوفره لدينا**\n\n**عند تحويل مبالغ اكثر من $3 انتظر شخص معه رتبه <@&1489784945982570516> فقط !**` 
        });

        await interaction.editReply({ 
            content: `✅ تم فتح التكت بنجاح: ${ticketChannel}` 
        });
    } catch (error) {
        console.error('❌ خطأ في فتح التكت:', error);
        await interaction.editReply({ 
            content: '❌ خطأ: تأكد من صلاحيات البوت.' 
        });
    }
}

// ==========================================
// 12. دالة إنشاء التكت
// ==========================================

async function createTicketChannel(interaction, channelName, section) {
    const permissions = [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { 
            id: interaction.user.id, 
            allow: [
                PermissionsBitField.Flags.ViewChannel, 
                PermissionsBitField.Flags.SendMessages, 
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.ReadMessageHistory
            ] 
        }
    ];

    if (ADMIN_ROLE_ID) {
        permissions.push({
            id: ADMIN_ROLE_ID,
            allow: [
                PermissionsBitField.Flags.ViewChannel, 
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
            ]
        });
    }

    if (TEAM_ROLE_ID) {
        permissions.push({
            id: TEAM_ROLE_ID,
            allow: [
                PermissionsBitField.Flags.ViewChannel, 
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
            ]
        });
    }

    return await interaction.guild.channels.create({
        name: channelName.slice(0, 100),
        parent: PARIS_CATEGORY_ID,
        topic: interaction.user.id,
        permissionOverwrites: permissions,
        type: ChannelType.GuildText,
    });
}

// ==========================================
// 13. معالجة النوافذ المنبثقة
// ==========================================

async function handleModalInteractions(interaction) {
    const { customId } = interaction;

    if (customId === 'shortcut_create_modal') {
        await handleShortcutCreate(interaction);
        return;
    }

    if (customId === 'shortcut_delete_modal') {
        await handleShortcutDelete(interaction);
        return;
    }
}

async function handleShortcutCreate(interaction) {
    const shortcutRaw = interaction.fields.getTextInputValue('shortcut_key').trim().toLowerCase();
    const response = interaction.fields.getTextInputValue('shortcut_response').trim();
    const deleteRaw = interaction.fields.getTextInputValue('shortcut_delete_trigger').trim().toLowerCase();

    if (!/^[^\s]{1,40}$/.test(shortcutRaw)) {
        return interaction.reply({
            content: '❌ الاختصار لازم يكون بدون مسافات وبحد أقصى 40 حرف.',
            ephemeral: true,
        });
    }

    if (!response.length) {
        return interaction.reply({
            content: '❌ لازم تكتب رسالة للاختصار.',
            ephemeral: true,
        });
    }

    const deleteMap = {
        yes: true, y: true, 'نعم': true, 'ايوه': true, true: true, '1': true,
        no: false, n: false, 'لا': false, false: false, '0': false,
    };

    if (!(deleteRaw in deleteMap)) {
        return interaction.reply({
            content: '❌ اختيار الحذف لازم يكون yes/no أو نعم/لا.',
            ephemeral: true,
        });
    }

    const exists = Boolean(global.shortcuts[shortcutRaw]);

    global.shortcuts[shortcutRaw] = {
        response,
        deleteTriggerMessage: deleteMap[deleteRaw],
        createdBy: interaction.user.id,
        createdAt: Date.now(),
    };
    
    global.saveDatabase();

    await interaction.reply({
        content: `${exists ? '✅ تم تحديث' : '✅ تم إنشاء'} الاختصار \`${shortcutRaw}\` بنجاح.\n- حذف رسالة العضو: **${deleteMap[deleteRaw] ? 'نعم' : 'لا'}**`,
        ephemeral: true,
    });
}

async function handleShortcutDelete(interaction) {
    const shortcutRaw = interaction.fields.getTextInputValue('shortcut_key_to_delete').trim().toLowerCase();

    if (!global.shortcuts[shortcutRaw]) {
        return interaction.reply({
            content: `❌ الاختصار \`${shortcutRaw}\` غير موجود.`,
            ephemeral: true,
        });
    }

    delete global.shortcuts[shortcutRaw];
    global.saveDatabase();

    await interaction.reply({
        content: `🗑️ تم حذف الاختصار \`${shortcutRaw}\` بنجاح.`,
        ephemeral: true,
    });
}

// ==========================================
// 14. معالجة الأخطاء العامة
// ==========================================

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

// ==========================================
// 15. تشغيل البوت
// ==========================================

client.login(config.token).catch(error => {
    console.error('❌ فشل تسجيل الدخول:', error);
    process.exit(1);
});
