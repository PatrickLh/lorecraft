<script setup lang="ts">
import RollingText from './RollingText.vue'
defineProps<{ value: number }>()
</script>
<template><span class="animated-value"><RollingText :value="value" /></span></template>
