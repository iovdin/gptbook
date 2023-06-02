// @ts-nocheck
import { IDisposable, DisposableDelegate } from '@lumino/disposable';
import {
  NotebookPanel,
  INotebookModel,
  NotebookActions,
} from '@jupyterlab/notebook';

import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { ToolbarButton } from '@jupyterlab/apputils';
import { LabIcon } from '@jupyterlab/ui-components';
import { Cell } from '@jupyterlab/cells';

import { CODEX_ICON } from './icon';

export interface ICodexConfig {
  api_key: string;
  engine: string;
  max_tokens: number;
  temperature: number;
  stop: string[];
}

export class CodexButtonExtension
  implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel>
{
  private config: ICodexConfig | undefined;

  constructor(
    private readonly pluginId: string,
    private readonly settingRegistry: ISettingRegistry,
  ) {
    this.settingRegistry.load(this.pluginId).then(settings => {
      settings.changed.connect(this.updateConfig.bind(this));
      this.updateConfig(settings);
    });
  }

  createNew(
    widget: NotebookPanel,
    context: DocumentRegistry.IContext<INotebookModel>,
  ): void | IDisposable {
    const button = new ToolbarButton({
      tooltip: 'GPT!',
      icon: new LabIcon({
        name: 'gpt',
        svgstr: CODEX_ICON,
      }),
      onClick: async () => {
        window.widget = widget;
        const notebook = widget.content.widgets;

        const messages = notebook
          .filter((cell: Cell, index) => index < widget.content.activeCellIndex)
          .map((cell: Cell, index) => {
            const lines = cell.model.value.text.split('\n');
            let role = '';
            const header = lines[0].toLowerCase();
            if (header.indexOf('assistant:') >= 0) {
              role = 'assistant';
            } else if (header.indexOf('user:') >= 0) {
              role = 'user';
            } else if (header.indexOf('system:') >= 0) {
              role = 'system';
            } else {
              return;
            }

            let content = lines.slice(1).join('\n');
            const outputContent = [];

            const outputs = cell.model.outputs;
            if (outputs) {
              for (let i = 0; i < outputs.list.length; i++) {
                const data = outputs.list.get(i).data;
                for (const mimeType of [
                  'application/vnd.jupyter.stdout',
                  'application/vnd.jupyter.stderr',
                  'text/plain',
                ]) {
                  if (data[mimeType]) {
                    outputContent.push(data[mimeType]);
                    break;
                  }
                }
              }
            }
            if (outputContent.length) {
              content += '\nOutput:\n' + outputContent.join('\n');
            }

            return {
              role,
              content,
            };
          });

        const { api_key, engine, max_tokens, temperature } = this.config;
        const xhr = new window.XMLHttpRequest();
        xhr.open('POST', 'https://api.openai.com/v1/chat/completions', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', 'Bearer ' + api_key);
        xhr.addEventListener('progress', () => {
          // check error
          let code = '';
          try {
            const res = JSON.parse(xhr.response.toString());
            code = res.error.message;
            console.log(res);
          } catch (e) {
            code = xhr.response
              .toString()
              .split('\n')
              .map(item => item.trim())
              .filter(item => !!item)
              .map(item => item.replace(/^data: /, ''))
              .filter(item => item !== '[DONE]')
              .map(item => JSON.parse(item))
              .map(item => item.choices[0].delta.content)
              .join('');
          }

          if (code && widget.content.activeCell) {
            // NotebookActions.insertBelow(widget.content.activeCell);
            // window.NotebookActions = NotebookActions
            widget.content.activeCell.model.value.text =
              '# assistant:\n' + code;
          }
        });
        xhr.send(
          JSON.stringify({
            model: engine,
            stream: true,
            temperature: temperature,
            max_tokens: max_tokens,
            messages: messages,
          }),
        );
      },
    });

    widget.toolbar.insertAfter('cellType', 'gpt', button);

    return new DisposableDelegate(() => {
      button.dispose();
    });
  }

  private updateConfig(settings: ISettingRegistry.ISettings): void {
    this.config = settings.composite as unknown as ICodexConfig;
  }
}
