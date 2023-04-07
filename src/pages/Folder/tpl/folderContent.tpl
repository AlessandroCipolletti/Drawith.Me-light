{{#each drawings}}
  <div class="folder__drawing {{#if this.isLoading}}folder__drawing-loading{{/if}} {{#if this.hasError}}folder__drawing-error{{/if}}" data-local-id="{{this.localDbId}}" data-global-id="{{this.globalId}}" style="background: url('{{this.localPathSmall}}') no-repeat center , url('static/img/paper/white.png'); background-size: contain, auto;">
    <div class="spinner"></div>
    <div class="folder__drawing-error-icon svg-icon-error-line"></div>
    <div class="folder__drawing-select-icon"></div>
  </div>
{{/each}}
