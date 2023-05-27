{{#each drawings}}
<div class="folder__drawing" data-local-id="{{this.localDbId}}">
  <canvas class="folder__drawing-preview-canvas"></canvas>
  <div class="folder__drawing-select-icon"></div>
</div>
{{/each}}