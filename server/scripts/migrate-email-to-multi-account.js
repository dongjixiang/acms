#!/usr/bin/env node
'use strict';

// ACMS 邮件 v2.0 — 从单账户迁移到多账户体系
//
// 流程：
//   1. 读 config.smtp（如果存在）
//   2. 创建默认 profile (id='default', name='默认身份') + 默认 account（凭证从 config.smtp 导入）
//   3. 把 7 个邮件 collection 所有 doc 加 profile_id='default'（如果还没有）
//
// 用法：
//   node scripts/migrate-email-to-multi-account.js           # 真改
//   node scripts/migrate-email-to-multi-account.js --dry-run  # 只打印

const path = require('path');
const fs = require('fs');

const DRY_RUN = process.argv.includes('--dry-run');

console.log(`[migrate] 模式: ${DRY_RUN ? 'DRY-RUN（不改任何数据）' : '实际执行'}`);
console.log('[migrate] 步骤 1/4: 加载依赖...');

// 必须在 init 之前 require config（确保 .env / config.json 已加载）
const config = require('../config');
const db = require('../db/connection');
const cipher = require('../services/email-credential-cipher');
const profileStore = require('../services/email-profile-store');
const accountStore = require('../services/email-account-store');

console.log('[migrate] 步骤 2/4: 检查现有 profile...');

const existingProfiles = profileStore.list();
if (existingProfiles.length > 0) {
  console.log(`[migrate] 检测到 ${existingProfiles.length} 个 profile（${existingProfiles.map(p => p.name).join(', ')}）— 跳过 profile/account 创建`);
  const defaultProfile = existingProfiles.find(p => p.id === 'default') || existingProfiles[0];
  console.log(`[migrate] 使用现有默认 profile: ${defaultProfile.id} (${defaultProfile.name})`);
  runCollectionMigration(defaultProfile.id, DRY_RUN);
  finish();
  process.exit(0);
}

const smtp = config.smtp;
if (!smtp || !smtp.host) {
  console.log('[migrate] 未配置 config.smtp — 跳过默认 profile/account 创建');
  console.log('[migrate] 跳过 collection 迁移（用户需先在 UI 创建 profile）');
  finish();
  process.exit(0);
}

console.log(`[migrate] config.smtp 已配置 (host=${smtp.host} user=${smtp.user || '(empty)'})`);

let defaultProfile = null;
let defaultAccount = null;

if (DRY_RUN) {
  console.log('[migrate] DRY-RUN: 将创建 profile "默认身份" + account (凭证 ' + (smtp.pass ? '有密码' : '无密码') + ')');
  // DRY-RUN 也展示 collection 现状（不算变更）
  runCollectionMigration('default', true);
} else {
  console.log('[migrate] 步骤 3/4: 创建默认 profile + account...');
  defaultProfile = profileStore.create({
    name: '默认身份',
    avatar: '👤',
    color: '#4ecdc4',
    type: 'personal',
    pin: '0000',  // 提示用户登录后立即改 PIN
  });
  console.log(`[migrate] profile created: ${defaultProfile.id}`);

  const imapHost = config.imapHost || process.env.IMAP_HOST || smtp.host.replace(/^smtp/, 'imap');
  const imapPort = config.imapPort || parseInt(process.env.IMAP_PORT || '993');

  defaultAccount = accountStore.create({
    profile_id: defaultProfile.id,
    email: smtp.from || smtp.user,
    name: '默认邮箱',
    color: '#4ecdc4',
    imap: {
      host: imapHost,
      port: imapPort,
      user: smtp.user,
      pass: smtp.pass || '',
      tls: config.imapTls !== false,
    },
    smtp: {
      host: smtp.host,
      port: smtp.port,
      user: smtp.user,
      pass: smtp.pass || '',
      secure: smtp.secure !== false,
      from_name: smtp.fromName || 'ACMS',
    },
  });
  console.log(`[migrate] account created: ${defaultAccount.id} (${defaultAccount.email})`);

  console.log('[migrate] 步骤 4/4: 迁移 7 个邮件 collection 到 profile_id=default...');
  runCollectionMigration(defaultProfile.id, DRY_RUN);
}

function runCollectionMigration(profileId, dryRun) {
  const COLLECTIONS = [
    'email_rules',
    'email_categories',
    'email_templates',
    'email_drafts',
    'email_rule_logs',
    'email_sender_categories',
    'email_classifications',
  ];

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalDocs = 0;

  for (const collName of COLLECTIONS) {
    const coll = db.collection(collName);
    const docs = coll.all();
    totalDocs += docs.length;
    if (docs.length === 0) {
      console.log(`  - ${collName}: 空 collection，跳过`);
      continue;
    }
    let updated = 0;
    let skipped = 0;
    for (const doc of docs) {
      if (doc.profile_id) {
        skipped++;  // 已有 profile_id，不动
        continue;
      }
      if (dryRun) {
        updated++;
      } else {
        coll.update(d => d === doc || (doc.id && d.id === doc.id), { profile_id: profileId });
        updated++;
      }
    }
    totalUpdated += updated;
    totalSkipped += skipped;
    console.log(`  - ${collName}: ${docs.length} doc | 更新 ${updated} | 已有 profile_id 跳过 ${skipped}`);
  }
  console.log(`[migrate] 迁移汇总: ${totalDocs} docs 总计 | 更新 ${totalUpdated} | 跳过 ${totalSkipped}`);
}

function finish() {
  console.log('[migrate] ✅ 完成');
  if (DRY_RUN) console.log('[migrate] 提示：去掉 --dry-run 参数以实际执行');
  try { db.close(); } catch (_) { /* ignore */ }
  setTimeout(() => process.exit(0), 100);
}
