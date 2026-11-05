import { useState } from 'react';
import { acknowledgeDemo } from '../domain/demoAcknowledgement';

export function useDemoAcknowledgement() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<ReturnType<
    typeof acknowledgeDemo
  > | null>(null);

  function confirm() {
    setResult(acknowledgeDemo(acknowledged));
  }

  function updateAcknowledgement(value: boolean) {
    setAcknowledged(value);
    setResult(null);
  }

  return { acknowledged, result, confirm, updateAcknowledgement };
}
