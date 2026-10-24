import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** 「写真からやり直す」：撮影画面へ戻す */
  onRetake: () => void;
  /** 「ホームへ戻る」 */
  onHome: () => void;
};
type State = { error: Error | null };

/**
 * 画面の描画中に起きた想定外のエラーを受け止め、アプリ全体が止まらないようにする（Issue #22）。
 * ボタンで戻ると、中身を作り直してもう一度表示する。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Bodrive: 画面でエラーが起きました', error, info);
  }

  private recover(action: () => void) {
    action();
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section className="app-error" role="alert">
        <h1>問題が起きたため、画面を止めました</h1>
        <p>
          写真やコースの処理で予期しないエラーが起きました。写真を選び直すか、ホームからやり直してください。
        </p>
        <code>{error.message}</code>
        <div className="capture-actions">
          <button
            type="button"
            className="capture-primary"
            onClick={() => this.recover(this.props.onRetake)}
          >
            写真からやり直す
          </button>
          <button type="button" onClick={() => this.recover(this.props.onHome)}>
            ホームへ戻る
          </button>
        </div>
      </section>
    );
  }
}
