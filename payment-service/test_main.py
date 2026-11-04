import unittest
from uuid import UUID

from pydantic import ValidationError

from main import PaymentRequest, build_payment_result


class PaymentSimulatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.payment = PaymentRequest(
            amount=25000,
            currency="RWF",
            channel="mtn_mobile_money",
            idempotency_key=UUID("d72900ef-0770-4bfc-94e1-844c838dd53a"),
        )

    def test_successful_payment_has_stable_reference_and_receipt(self) -> None:
        first = build_payment_result(self.payment, "test-secret")
        second = build_payment_result(self.payment, "test-secret")

        self.assertEqual(first["status"], "succeeded")
        self.assertEqual(first["reference"], second["reference"])
        self.assertEqual(first["receipt_number"], second["receipt_number"])
        self.assertTrue(str(first["reference"]).startswith("VIRT-"))
        self.assertEqual(first["amount"], 25000)
        self.assertTrue(first["simulation"])

    def test_failure_is_explicit_and_never_looks_successful(self) -> None:
        failed_payment = self.payment.model_copy(update={"simulate_failure": True})

        result = build_payment_result(failed_payment, "test-secret")

        self.assertEqual(result["status"], "failed")
        self.assertTrue(result["simulation"])

    def test_invalid_amount_and_channel_are_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            PaymentRequest(
                amount=0,
                currency="RWF",
                channel="mtn_mobile_money",
                idempotency_key=self.payment.idempotency_key,
            )
        with self.assertRaises(ValidationError):
            PaymentRequest(
                amount=10,
                currency="RWF",
                channel="unknown",
                idempotency_key=self.payment.idempotency_key,
            )


if __name__ == "__main__":
    unittest.main()
