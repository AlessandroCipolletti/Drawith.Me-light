{{#each drawings}}
<div class="folder__drawing" data-local-id="{{this.localDbId}}" data-global-id="{{this.globalId}}"
  style="background: url('{{this.localPathSmall}}') no-repeat center , url('static/img/paper/white.png'); background-size: contain, auto;">
  <div class="spinner"></div>
  <div class="folder__drawing-select-icon"></div>
</div>
{{/each}}