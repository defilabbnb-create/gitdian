#!/usr/bin/env node

import process from 'node:process';
import { chromium } from 'playwright';

const DEFAULT_BASE_URL = 'https://local3000.luckytad.vip/';
const DEFAULT_DETAIL_PATH = '/repositories/cmn46jk2h26pyl58tpqe89zz5';

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.GITDIAN_VERIFY_BASE_URL ?? DEFAULT_BASE_URL,
    detailPath: process.env.GITDIAN_VERIFY_DETAIL_PATH ?? DEFAULT_DETAIL_PATH,
  };

  for (const arg of argv) {
    if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
      continue;
    }

    if (arg.startsWith('--detail-path=')) {
      options.detailPath = arg.slice('--detail-path='.length);
    }
  }

  return options;
}

function buildUrl(baseUrl, pathname = '/') {
  return new URL(pathname, baseUrl).toString();
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function createPageResult(name, url) {
  return {
    name,
    url,
    passes: [],
    failures: [],
    notes: [],
  };
}

function recordPass(result, message) {
  result.passes.push(message);
}

function recordFail(result, message) {
  result.failures.push(message);
}

function expectText(result, text, expected, description) {
  if (text.includes(expected)) {
    recordPass(result, description);
    return;
  }

  recordFail(result, `${description}：缺少「${expected}」`);
}

function expectNoText(result, text, forbidden, description) {
  if (!text.includes(forbidden)) {
    recordPass(result, description);
    return;
  }

  recordFail(result, `${description}：仍出现「${forbidden}」`);
}

async function countVisible(page, selector) {
  const locator = page.locator(selector);
  const total = await locator.count();
  let visible = 0;

  for (let index = 0; index < total; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) {
      visible += 1;
    }
  }

  return visible;
}

async function getMainText(page) {
  return normalizeText(await page.locator('main').innerText());
}

async function gotoPage(page, url) {
  await page.goto(url, {
    waitUntil: 'networkidle',
    timeout: 30_000,
  });
}

async function verifyHome(browser, options) {
  const url = buildUrl(options.baseUrl, '/');
  const page = await browser.newPage();
  const result = createPageResult('首页', url);

  try {
    await gotoPage(page, url);
    const text = await getMainText(page);

    expectText(result, text, '当前没有新的高价值方向', '首页空状态标题可见');
    expectText(result, text, '去完整机会池继续筛', '首页唯一主 CTA 文案可见');

    const homePrimaryCount = await countVisible(
      page,
      '[data-home-empty-primary-cta="true"]',
    );
    if (homePrimaryCount === 1) {
      recordPass(result, '首页只出现一个主 CTA');
    } else {
      recordFail(result, `首页主 CTA 数量异常：期望 1，实际 ${homePrimaryCount}`);
    }

    for (const label of ['全部项目', '收藏', '任务', '设置']) {
      expectText(result, text, label, `首页次级入口可见：${label}`);
    }

    const expandButton = page.getByRole('button', {
      name: '展开完整机会池',
    });
    const settledSelector =
      '[data-opportunity-pool-state="success"],[data-opportunity-pool-state="empty"],[data-opportunity-pool-state="error"]';

    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
    }

    await page.waitForSelector(settledSelector, {
      timeout: 15_000,
    });

    const settledPanel = page.locator(settledSelector).first();
    const settledState = await settledPanel.getAttribute('data-opportunity-pool-state');
    result.notes.push(`完整机会池最终状态：${settledState ?? 'unknown'}`);

    if (
      settledState === 'success' ||
      settledState === 'empty' ||
      settledState === 'error'
    ) {
      recordPass(result, `完整机会池已收敛到确定状态：${settledState}`);
    } else {
      recordFail(result, '完整机会池未收敛到 success / empty / error');
    }

    const skeletonVisible = await countVisible(
      page,
      '[data-opportunity-pool-skeleton="true"]',
    );
    if (skeletonVisible === 0) {
      recordPass(result, '完整机会池不会永久停留在 skeleton');
    } else {
      recordFail(result, '完整机会池仍有可见 skeleton');
    }
  } catch (error) {
    recordFail(
      result,
      `首页巡检失败：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await page.close();
  }

  return result;
}

async function verifyRepositoryDetail(browser, options) {
  const url = buildUrl(options.baseUrl, options.detailPath);
  const page = await browser.newPage();
  const result = createPageResult('详情页', url);

  try {
    await gotoPage(page, url);
    const text = await getMainText(page);

    for (const label of ['当前结论', '当前优先级', '当前动作', '当前状态']) {
      expectText(result, text, label, `详情页英雄区字段可见：${label}`);
    }

    const primaryCount = await countVisible(page, '[data-detail-primary-cta="true"]');
    if (primaryCount === 1) {
      recordPass(result, '详情页只出现一个主 CTA');
    } else {
      recordFail(result, `详情页主 CTA 数量异常：期望 1，实际 ${primaryCount}`);
    }

    expectText(result, text, '开始验证', '详情页当前主 CTA 为开始验证');

    for (const legacyCopy of [
      '开始做这个项目',
      '用 1 小时验证这个想法',
      '验证通过（可做）',
      '建议动作 立即做',
    ]) {
      expectNoText(result, text, legacyCopy, `详情页旧强动作文案已移除`);
    }

    const moduleCount = await countVisible(page, '[data-detail-module]');
    if (moduleCount === 3) {
      recordPass(result, '详情页三张分析卡都存在');
    } else {
      recordFail(result, `详情页分析卡数量异常：期望 3，实际 ${moduleCount}`);
    }

    const openModuleCount = await countVisible(page, '[data-detail-module][open]');
    if (openModuleCount === 0) {
      recordPass(result, '详情页三张分析卡默认折叠');
    } else {
      recordFail(result, `详情页存在默认展开的分析卡：${openModuleCount}`);
    }

    expectNoText(
      result,
      text,
      'This repository looks promising for small teams',
      '详情页主流程不直接暴露英文长段原文',
    );

    for (const internalAction of ['补创业评分', '补点子提取', '补完整性分析']) {
      expectNoText(result, text, internalAction, '详情页主流程不暴露内部补跑动作');
    }
  } catch (error) {
    recordFail(
      result,
      `详情页巡检失败：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await page.close();
  }

  return result;
}

async function verifyJobs(browser, options) {
  const url = buildUrl(options.baseUrl, '/jobs');
  const page = await browser.newPage();
  const result = createPageResult('任务页', url);

  try {
    await gotoPage(page, url);
    const text = await getMainText(page);

    for (const label of ['任务工作台', '当前视图：聚合摘要', '聚合组数']) {
      expectText(result, text, label, `任务页聚合摘要可见：${label}`);
    }

    const aggregateCount = await countVisible(page, '[data-testid="jobs-aggregated-group"]');
    if (aggregateCount > 0) {
      recordPass(result, `任务页存在 ${aggregateCount} 张聚合摘要卡`);
    } else {
      recordFail(result, '任务页没有可见的聚合摘要卡');
    }

    expectNoText(result, text, '取消任务', '任务页首屏不平铺取消任务');

    const expandButton = page.getByRole('button', {
      name: '展开完整任务流',
    });
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
    }

    await page.waitForSelector('[data-jobs-expanded-flow="expanded"]', {
      timeout: 10_000,
    });

    const expandedText = await getMainText(page);
    expectText(result, expandedText, '查看执行信息', '任务页可以展开完整任务流');
  } catch (error) {
    recordFail(
      result,
      `任务页巡检失败：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await page.close();
  }

  return result;
}

async function verifyFavorites(browser, options) {
  const url = buildUrl(options.baseUrl, '/favorites');
  const page = await browser.newPage();
  const result = createPageResult('收藏页', url);

  try {
    await gotoPage(page, url);
    const text = await getMainText(page);

    const followUpCard = page.locator('[data-testid="favorites-follow-up-card"]').first();
    const followUpCardVisible = await followUpCard.isVisible().catch(() => false);
    if (!followUpCardVisible) {
      recordFail(result, '收藏页首屏没有可见的主卡');
      return result;
    }

    const primaryCount = await countVisible(
      followUpCard,
      '[data-favorite-primary-cta="true"]',
    );
    if (primaryCount === 1) {
      recordPass(result, '收藏页主卡只出现一个主动作');
    } else {
      recordFail(result, `收藏页主卡主动作数量异常：期望 1，实际 ${primaryCount}`);
    }

    const cardText = normalizeText(await followUpCard.innerText());
    for (const forbidden of [
      '编辑收藏',
      '去 GitHub',
      '推进到尝试',
      '暂停观察',
      '放弃',
    ]) {
      expectNoText(result, cardText, forbidden, `收藏页主卡不再平铺：${forbidden}`);
    }

    for (const label of ['现在值不值得继续跟', '最近有没有变化', '下一步做什么']) {
      expectText(result, cardText, label, `收藏页主卡关键信息保留：${label}`);
    }

    const expandedPool = page.locator('[data-testid="favorites-expanded-pool"]');
    const expandedPoolVisible = await expandedPool.isVisible().catch(() => false);
    if (!expandedPoolVisible) {
      recordFail(result, '收藏页完整收藏池容器不可见');
      return result;
    }

    const expandedState = await expandedPool.getAttribute('data-favorites-expanded-state');
    if (expandedState === 'collapsed') {
      recordPass(result, '完整收藏池默认收起');
    } else {
      recordFail(result, `完整收藏池默认状态异常：${expandedState ?? 'unknown'}`);
    }

    expectText(result, text, '展开完整收藏池', '收藏页仍保留完整收藏池入口');
  } catch (error) {
    recordFail(
      result,
      `收藏页巡检失败：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await page.close();
  }

  return result;
}

async function verifySettings(browser, options) {
  const url = buildUrl(options.baseUrl, '/settings');
  const page = await browser.newPage();
  const result = createPageResult('配置页', url);

  try {
    await gotoPage(page, url);
    const text = await getMainText(page);

    for (const label of [
      '当前构建版本',
      'Git SHA:',
      'Environment:',
      'Build Time:',
      '当前运行模式',
      '系统健康摘要',
      '最常改配置入口',
    ]) {
      expectText(result, text, label, `配置页首屏可见：${label}`);
    }

    const sectionCount = await countVisible(page, '[data-settings-section]');
    if (sectionCount === 3) {
      recordPass(result, '配置页三大配置组都存在');
    } else {
      recordFail(result, `配置页配置组数量异常：期望 3，实际 ${sectionCount}`);
    }

    const openCount = await countVisible(page, '[data-settings-section][open]');
    if (openCount === 1) {
      recordPass(result, '配置页默认只展开一组配置');
    } else {
      recordFail(result, `配置页默认展开数量异常：期望 1，实际 ${openCount}`);
    }

    const githubOpenCount = await countVisible(page, '#settings-github[open]');
    if (githubOpenCount === 1) {
      recordPass(result, 'GitHub 采集配置默认展开');
    } else {
      recordFail(result, 'GitHub 采集配置没有默认展开');
    }

    const fastFilterOpen = await countVisible(
      page,
      '[data-settings-section="Fast Filter 配置"][open]',
    );
    if (fastFilterOpen === 0) {
      recordPass(result, 'Fast Filter 配置默认折叠');
    } else {
      recordFail(result, 'Fast Filter 配置默认处于展开状态');
    }

    const aiOpen = await countVisible(
      page,
      '[data-settings-section="AI 路由与模型配置"][open]',
    );
    if (aiOpen === 0) {
      recordPass(result, 'AI 路由与模型配置默认折叠');
    } else {
      recordFail(result, 'AI 路由与模型配置默认处于展开状态');
    }

    for (const forbidden of [
      'GitHub 默认模式',
      'AI Fallback',
      '这几条规则最容易直接改变系统今天会怎么跑',
    ]) {
      expectNoText(result, text, forbidden, 'Behavior Notes 不再抢首屏主体');
    }
  } catch (error) {
    recordFail(
      result,
      `配置页巡检失败：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await page.close();
  }

  return result;
}

function printResult(result) {
  const status = result.failures.length === 0 ? 'PASS' : 'FAIL';
  console.log(`\n[${status}] ${result.name}`);
  console.log(`URL: ${result.url}`);

  if (result.notes.length) {
    for (const note of result.notes) {
      console.log(`  note: ${note}`);
    }
  }

  if (result.failures.length) {
    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
    return;
  }

  for (const pass of result.passes) {
    console.log(`  - ${pass}`);
  }
}

async function launchBrowser() {
  try {
    return await chromium.launch({
      channel: 'chrome',
      headless: true,
    });
  } catch (error) {
    throw new Error(
      `无法通过 Playwright 拉起 Google Chrome：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await launchBrowser();
  const results = [];

  try {
    const verifications = [
      ['首页', verifyHome],
      ['详情页', verifyRepositoryDetail],
      ['任务页', verifyJobs],
      ['收藏页', verifyFavorites],
      ['配置页', verifySettings],
    ];

    for (const [label, verify] of verifications) {
      console.log(`Checking ${label}...`);
      results.push(await verify(browser, options));
    }
  } finally {
    await browser.close();
  }

  console.log(`Production acceptance check for ${options.baseUrl}`);
  console.log(`Detail page path: ${options.detailPath}`);

  for (const result of results) {
    printResult(result);
  }

  const failedPages = results.filter((result) => result.failures.length > 0);
  const passedPages = results.length - failedPages.length;

  console.log(
    `\nSummary: ${passedPages}/${results.length} pages passed production acceptance.`,
  );

  if (failedPages.length) {
    console.log(
      `Failed pages: ${failedPages.map((result) => result.name).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('All production acceptance checks passed.');
}

main().catch((error) => {
  console.error(
    `Production acceptance script failed to run: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
