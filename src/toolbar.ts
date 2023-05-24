import { IDisposable, DisposableDelegate } from '@lumino/disposable';
import { NotebookPanel, INotebookModel } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { ToolbarButton } from '@jupyterlab/apputils';
import { LabIcon } from '@jupyterlab/ui-components';
import { Cell } from '@jupyterlab/cells';

import { requestAPI } from './handler';

import { CODEX_ICON } from './icon';

export interface ICodexConfig {
  api_key: string;
  engine: string;
  max_tokens: number;
  temperature: number;
  displayLineTimeout: number;
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
        const notebook = widget.content.widgets;

        let passActive = false;
        //let activeIndex = -1;
        const messages = notebook
          .map((cell: Cell, index) => {
            if (passActive) {
              return;
            }
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

            if (cell === widget.content.activeCell) {
              passActive = true;
              //activeIndex = index;
            }
            const content = lines.slice(1).join('\n');

            return {
              role,
              content,
            };
          })
          .filter(item => item);

        const payload = Object.assign({}, this.config, {
          messages,
        });

        const data = await requestAPI<any>('completion', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        console.log(data);

        if (
          data.choices &&
          data.choices.length > 0 &&
          widget.content.activeCell
        ) {
          const code = data.choices[0].message.content;
          widget.content.activeCell.model.value.text = '# assistant:\n' + code;
        }
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
