<script setup lang="ts">
import { LayoutDashboard } from 'lucide-vue-next'
</script>

<template>
  <section class="placeholder-panel">
    <div class="placeholder-icon">
      <LayoutDashboard :size="34" />
    </div>
    <h3>模块建设中</h3>
    <p>当前处于原型 UI 对齐阶段，作品概览模块会在后续迭代补充真实数据内容。</p>
  </section>
</template>

<style scoped>
.placeholder-panel {
  display: flex;
  min-height: calc(100vh - 220px);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #86868b;
  text-align: center;
}

.placeholder-icon {
  display: inline-flex;
  width: 84px;
  height: 84px;
  align-items: center;
  justify-content: center;
  border-radius: 28px;
  background: #f8fafc;
  color: #cbd5e1;
  margin-bottom: 24px;
}

.placeholder-panel h3 {
  margin: 0 0 10px;
  color: #1d1d1f;
  font-size: 24px;
  font-weight: 650;
}

.placeholder-panel p {
  max-width: 360px;
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
}
</style>
