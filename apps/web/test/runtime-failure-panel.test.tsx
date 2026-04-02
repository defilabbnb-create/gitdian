import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RuntimeFailurePanel } from '../src/components/runtime-failure-panel';

test('runtime failure panel renders recovery and diagnostics links', () => {
  const html = renderToStaticMarkup(
    <RuntimeFailurePanel
      title="项目列表暂时加载失败"
      message="后端接口当前不可达。"
    />,
  );

  assert.match(html, /项目列表暂时加载失败/);
  assert.match(html, /后端接口当前不可达/);
  assert.match(html, /回到首页继续看可用内容/);
  assert.match(html, /去任务页看队列状态/);
  assert.match(html, /去设置页看运行配置/);
});
