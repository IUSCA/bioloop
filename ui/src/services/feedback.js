import toast from "@/services/toast";
import api from "./api";

class FeedbackService {
  async submitFeedback({ fullName, email, rating, comments }) {
    try {
      const response = await api.post("/feedback", {
        fullName,
        email,
        rating,
        comments,
      });
      toast.success("Thank you for your feedback!");
      return response.data;
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast.error("There was an error submitting your feedback. Please try again.");
      throw error;
    }
  }
}

export default new FeedbackService();
